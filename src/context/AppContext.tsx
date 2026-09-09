'use client';

import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import {
  Product,
  Category,
  CartItem,
  DeliveryMethod,
  DeliveryLocation,
  DeliveryQuote,
  Customer,
  Order,
  OrderStatus,
  Branch,
  Business,
  BusinessHours,
} from '@/types';
import { ProductRepository } from '@/repositories/ProductRepository';
import { OrderRepository } from '@/repositories/OrderRepository';
import { ExecuteActionParams } from '@/repositories/interfaces/IOrderRepository';
import { DeliveryService } from '@/services/DeliveryService';
import { BusinessHoursService } from '@/services/BusinessHoursService';
import { hoursForBranch } from '@/lib/branchSelection';
import { DemoBroadcastService } from '@/services/DemoBroadcastService';
import { isDemoMode } from '@/config/demo';
import { useBranch } from '@/context/BranchContext';
import { getBusinessRepository } from '@/repositories/factory';
import { mergeCartItem } from '@/lib/cart';
import { resolveDeliveryQuote } from '@/lib/deliveryQuote';

const CART_STORAGE_KEY = 'el_taca_nijo_cart';
const LOCATION_STORAGE_KEY = 'el_taca_nijo_location';
const DELIVERY_METHOD_KEY = 'el_taca_nijo_delivery_method';
const CUSTOMER_STORAGE_KEY = 'el_taca_nijo_customer';

interface AppContextType {
  // Tenant
  businessId: string;
  business: Business | null;

  // Demo Mode -- fuente unica para componentes cliente. Evita que cada
  // componente vuelva a llamar isDemoMode() (o peor, reimplemente su propio
  // chequeo de env vars) por separado; ver src/config/demo.ts.
  isDemo: boolean;

  // Catalog
  products: Product[];
  categories: Category[];
  catalogLoading: boolean;
  toggleProductAvailability: (productId: string, isAvailable: boolean) => Promise<void>;
  
  // Modal
  selectedProductForModal: Product | null;
  openProductModal: (product: Product) => void;
  closeProductModal: () => void;

  // Cart
  cart: CartItem[];
  isCartOpen: boolean;
  setIsCartOpen: (open: boolean) => void;
  addToCart: (item: Omit<CartItem, 'id'>) => void;
  cartNotice: CartNotice | null;
  dismissCartNotice: () => void;
  updateCartItemQuantity: (id: string, delta: number) => void;
  updateItemNotes: (id: string, notes: string) => void;
  removeFromCart: (id: string) => void;
  clearCart: () => void;
  cartSubtotal: number;
  cartTotalCount: number;

  // Horario
  // Fuente unica de si el negocio esta atendiendo. Antes solo el Header lo
  // calculaba, con su propio fetch, y el checkout no lo consultaba: se podia
  // pagar un pedido que nadie iba a ver hasta el dia siguiente.
  storeStatus: { isOpen: boolean; reason?: string };

  // Delivery & Location
  deliveryMethod: DeliveryMethod;
  setDeliveryMethod: (method: DeliveryMethod) => void;
  deliveryLocation: DeliveryLocation;
  setDeliveryLocation: (loc: DeliveryLocation) => void;
  deliveryFeeResult: DeliveryQuote;

  // Customer
  customerInfo: Customer;
  setCustomerInfo: (cust: Customer) => void;

  // Orders
  orders: Order[];
  updateOrderStatus: (orderId: string, status: OrderStatus) => Promise<void>;
  executeOrderAction: (params: ExecuteActionParams) => Promise<void>;
  refreshOrders: () => Promise<void>;
}

export interface CartNotice {
  productName: string;
  quantity: number;
}

export const AppContext = createContext<AppContextType | undefined>(undefined);

const DEFAULT_LOCATION: DeliveryLocation = {
  latitude: 0,
  longitude: 0,
  address: '',
  locationType: 'Casa',
  hasSelectedLocation: false,
};

export const AppProvider: React.FC<{ businessId: string; children: React.ReactNode }> = ({
  businessId,
  children,
}) => {
  const {
    selectedBranch,
    manuallySelected: sucursalElegidaAMano,
    branches,
    autoSelectForLocation,
    zones,
    loading: branchLoading,
  } = useBranch();

  // NEXT_PUBLIC_* se inlinea en build time -- no necesita estado/efecto,
  // es el mismo valor durante todo el ciclo de vida del bundle cliente.
  const isDemo = isDemoMode();

  // State
  // Arrancan vacios/null (no en los datos mock de El Taca Nijo): mientras el
  // fetch real esta en vuelo, cualquier negocio mostraba brevemente el
  // catalogo y nombre de El Taca Nijo -- si el visitante navegaba fuera en
  // ese instante (ej. al panel admin), el "atras" del navegador restauraba
  // ese frame congelado desde bfcache con la marca equivocada.
  const [business, setBusiness] = useState<Business | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [selectedProductForModal, setSelectedProductForModal] = useState<Product | null>(null);
  
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [cartNotice, setCartNotice] = useState<CartNotice | null>(null);

  const [deliveryMethod, setDeliveryMethodState] = useState<DeliveryMethod>('delivery');
  const [deliveryLocation, setDeliveryLocationState] = useState<DeliveryLocation>(DEFAULT_LOCATION);
  const [deliveryFeeResult, setDeliveryFeeResult] = useState<DeliveryQuote>(() => ({
    available: false,
    isUnselected: true,
    fee: 0,
    reason: 'Selecciona tu ubicación en el mapa para calcular el delivery.',
  }));

  const [customerInfo, setCustomerInfoState] = useState<Customer>({ name: '', phone: '' });
  const [orders, setOrders] = useState<Order[]>([]);
  const [businessHours, setBusinessHours] = useState<BusinessHours[]>([]);

  // Marca que localStorage ya fue leido. Sin esto, el efecto que persiste el
  // carrito corria tambien en el primer commit -- con el carrito todavia
  // vacio -- y pisaba lo guardado con "[]" antes de restaurarlo. Con un solo
  // montaje el commit siguiente lo reescribia y no se notaba; con dos
  // montajes (StrictMode en desarrollo, o cualquier remount) la segunda
  // lectura ya encontraba "[]" y el pedido del cliente desaparecia.
  const [hydrated, setHydrated] = useState(false);

  // Initialize from Repositories & LocalStorage on Client Hydration
  useEffect(() => {
    const loadCatalogAndOrders = async () => {
      // Promise.allSettled en vez de Promise.all: en el storefront publico
      // (visitante anonimo) el SELECT sobre "orders" es rechazado por RLS a
      // proposito (un cliente no debe poder listar los pedidos de otros).
      // Con Promise.all, ese unico rechazo tiraba abajo TODA la carga -- el
      // catch nunca llamaba a los setState y la tienda quedaba pegada en los
      // datos mock iniciales (initialCategories/initialProducts) para
      // cualquier negocio, sin importar que su propio fetch si hubiera
      // funcionado. Cada pieza ahora se aplica de forma independiente.
      const [catResult, prodResult, orderResult, businessResult, hoursResult] =
        await Promise.allSettled([
          ProductRepository.getCategories(businessId),
          ProductRepository.getAllProducts(businessId),
          OrderRepository.getOrders(businessId),
          getBusinessRepository().getBusiness(businessId),
          getBusinessRepository().getBusinessHours(undefined, businessId),
        ]);

      if (catResult.status === 'fulfilled') setCategories(catResult.value);
      else console.error('Failed to load categories:', catResult.reason);

      if (prodResult.status === 'fulfilled') setProducts(prodResult.value);
      else console.error('Failed to load products:', prodResult.reason);

      if (orderResult.status === 'fulfilled') setOrders(orderResult.value);
      else console.error('Failed to load orders:', orderResult.reason);

      if (businessResult.status === 'fulfilled') setBusiness(businessResult.value);
      else console.error('Failed to load business:', businessResult.reason);

      if (hoursResult.status === 'fulfilled') setBusinessHours(hoursResult.value);
      else console.error('Failed to load business hours:', hoursResult.reason);

      setCatalogLoading(false);
    };

    loadCatalogAndOrders();

    // Subscribe to DemoBroadcastService so state syncs across browser tabs without F5
    const unsubscribe = DemoBroadcastService.subscribe(() => {
      loadCatalogAndOrders();
    });

    // DemoBroadcastService (BroadcastChannel/localStorage) solo sincroniza
    // pestanas del MISMO origen. La tienda vive en {slug}.{root} y el admin
    // en admin.{root} -- origenes distintos -- asi que un pedido creado en
    // la tienda nunca llegaba a la pantalla de Cocina/Despacho sin recargar
    // a mano. En modo demo, se hace polling de pedidos cada pocos segundos
    // como sustituto de tiempo real entre subdominios.
    let pollInterval: ReturnType<typeof setInterval> | undefined;
    if (isDemo) {
      pollInterval = setInterval(async () => {
        try {
          const fresh = await OrderRepository.getOrders(businessId);
          setOrders(fresh);
        } catch (err) {
          console.error('Failed to poll demo orders:', err);
        }
      }, 4000);
    }

    return () => {
      unsubscribe();
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [businessId]);

  useEffect(() => {
    try {
      const storedCart = localStorage.getItem(CART_STORAGE_KEY);
      if (storedCart) setCart(JSON.parse(storedCart));

      const storedMethod = localStorage.getItem(DELIVERY_METHOD_KEY);
      if (storedMethod) setDeliveryMethodState(storedMethod as DeliveryMethod);

      const storedLoc = localStorage.getItem(LOCATION_STORAGE_KEY);
      if (storedLoc) {
        const parsed = JSON.parse(storedLoc);
        setDeliveryLocationState(parsed);
      }

      const storedCust = localStorage.getItem(CUSTOMER_STORAGE_KEY);
      if (storedCust) setCustomerInfoState(JSON.parse(storedCust));
    } catch (e) {
      console.error('Failed to load state from localStorage:', e);
    } finally {
      setHydrated(true);
    }
  }, []);

  // Sync Cart to LocalStorage
  useEffect(() => {
    // Nunca escribir antes de haber leido: ver el comentario de `hydrated`.
    if (!hydrated) return;
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } catch (e) {
      console.error(e);
    }
  }, [cart, hydrated]);

  // Si el negocio no cargo horarios, isRestaurantOpen devuelve "abierto": se
  // prefiere dejar comprar antes que bloquear una tienda mal configurada.
  const storeStatus = useMemo(() => {
    const timezone = business?.timezone || 'America/Guayaquil';
    if (selectedBranch) {
      return BusinessHoursService.isRestaurantOpen(
        hoursForBranch(businessHours, selectedBranch.id),
        timezone
      );
    }
    // Sin sucursal elegida todavia, alcanza con que alguna este atendiendo.
    const abierta = branches.find(
      (b) => BusinessHoursService.isRestaurantOpen(hoursForBranch(businessHours, b.id), timezone).isOpen
    );
    if (abierta) return { isOpen: true };
    return branches[0]
      ? BusinessHoursService.isRestaurantOpen(hoursForBranch(businessHours, branches[0].id), timezone)
      : { isOpen: true };
  }, [businessHours, business?.timezone, selectedBranch, branches]);

  // Catalog Handlers
  const toggleProductAvailability = async (productId: string, isAvailable: boolean) => {
    setProducts((prev) =>
      prev.map((p) => (p.id === productId ? { ...p, isAvailable } : p))
    );
    await ProductRepository.setProductAvailability(productId, isAvailable);
  };

  const openProductModal = (product: Product) => setSelectedProductForModal(product);
  const closeProductModal = () => setSelectedProductForModal(null);

  // Cart Handlers
  //
  // Cada toque en "Agregar" tapaba el menu abriendo el panel del carrito: si
  // el cliente queria pedir cuatro tacos, tenia que cerrarlo y volver a
  // buscar donde estaba cada vez. Ahora el carrito se queda cerrado y en su
  // lugar se enciende cartNotice, un aviso breve que un toast puede leer sin
  // interrumpir la navegacion.
  //
  // mergeCartItem tambien evita que dos toques sobre el mismo producto (con
  // las mismas opciones) generen dos lineas separadas -- antes "1 x Gaseosa"
  // aparecia repetido en el carrito, en la confirmacion y en la comanda de
  // cocina, en vez de un solo "2 x Gaseosa".
  const addToCart = (item: Omit<CartItem, 'id'>) => {
    setCart((prev) => mergeCartItem(prev, item));
    setCartNotice({ productName: item.product.name, quantity: item.quantity });
  };

  const dismissCartNotice = () => setCartNotice(null);

  const updateCartItemQuantity = (id: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.id === id) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const updateItemNotes = (id: string, notes: string) => {
    setCart((prev) =>
      prev.map((item) => (item.id === id ? { ...item, notes } : item))
    );
  };

  const removeFromCart = (id: string) => {
    setCart((prev) => prev.filter((item) => item.id !== id));
  };

  const clearCart = () => {
    setCart([]);
    try {
      localStorage.removeItem(CART_STORAGE_KEY);
    } catch (e) {
      console.error(e);
    }
  };

  const cartSubtotal = cart.reduce((sum, item) => {
    const modifiersCost = (item.selectedModifiers || []).reduce((mSum, m) => mSum + m.price, 0);
    return sum + (item.unitPrice + modifiersCost) * item.quantity;
  }, 0);

  const cartTotalCount = cart.reduce((count, item) => count + item.quantity, 0);

  // Delivery & Customer Handlers
  const setDeliveryMethod = (method: DeliveryMethod) => {
    setDeliveryMethodState(method);
    try {
      localStorage.setItem(DELIVERY_METHOD_KEY, method);
    } catch (e) {
      console.error(e);
    }
  };

  const cotizarParaSucursal = (branch: Branch, lat: number, lng: number): DeliveryQuote => {
    return DeliveryService.calculateDeliveryFee(
      {
        branchLatitude: branch.latitude,
        branchLongitude: branch.longitude,
        customerLatitude: lat,
        customerLongitude: lng,
      },
      zones.filter((z) => z.branchId === branch.id)
    );
  };

  // Cotiza respetando una sucursal elegida a mano mientras siga cubriendo el
  // punto; si no hay eleccion manual, o la que hay ya no llega hasta ahi,
  // recien entonces auto-selecciona la mas cercana. Sincroniza BranchContext
  // (autoSelectForLocation) solo cuando de verdad hace falta cambiar de
  // sucursal -- no en cada recotizacion -- para no pisar en silencio una
  // eleccion que el cliente hizo a proposito.
  const cotizarRespetandoEleccion = (lat: number, lng: number): DeliveryQuote => {
    const sucursalManual = sucursalElegidaAMano ? selectedBranch : null;
    const resultado = resolveDeliveryQuote({
      lat,
      lng,
      branches,
      zones,
      manuallySelectedBranch: sucursalManual,
    });

    if (!sucursalManual || resultado.branch?.id !== sucursalManual.id) {
      autoSelectForLocation(lat, lng);
    }

    return resultado.quote;
  };

  // Este setter lo usan dos cosas distintas: elegir un punto (GPS, clic o pin
  // arrastrado) y editar metadata del domicilio (direccion, referencia, tipo
  // de lugar). Forzar hasSelectedLocation: true servia para lo primero y
  // rompia lo segundo: escribir la primera letra de la direccion marcaba la
  // ubicacion como elegida y cotizaba contra (0, 0), asi que el cliente veia
  // "fuera de nuestra zona de delivery" antes de haber tocado el mapa. Ahora
  // el flag lo decide quien llama, y solo se cotiza si de verdad hay punto.
  const setDeliveryLocation = (loc: DeliveryLocation) => {
    const yaEligioPunto = loc.hasSelectedLocation ?? deliveryLocation.hasSelectedLocation ?? false;
    const updatedLoc = { ...loc, hasSelectedLocation: yaEligioPunto };

    setDeliveryLocationState(updatedLoc);

    if (yaEligioPunto) {
      setDeliveryFeeResult(cotizarRespetandoEleccion(updatedLoc.latitude, updatedLoc.longitude));
    }
    try {
      localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(updatedLoc));
    } catch (e) {
      console.error(e);
    }
  };

  // Recalcula la cotizacion de delivery una vez que BranchContext termina de cargar
  // sucursales y zonas, para no cotizar contra un array de zonas todavia vacio.
  useEffect(() => {
    if (!branchLoading && deliveryLocation.hasSelectedLocation) {
      setDeliveryFeeResult(cotizarRespetandoEleccion(deliveryLocation.latitude, deliveryLocation.longitude));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchLoading]);

  // Recotiza cuando el cliente cambia la sucursal manualmente (ej. desde BranchPicker),
  // usando la sucursal elegida directamente en vez de auto-seleccionar de nuevo —
  // auto-seleccionar aqui revertiria la eleccion manual del cliente.
  useEffect(() => {
    if (!branchLoading && selectedBranch && deliveryLocation.hasSelectedLocation) {
      setDeliveryFeeResult(cotizarParaSucursal(selectedBranch, deliveryLocation.latitude, deliveryLocation.longitude));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranch?.id]);

  const setCustomerInfo = (cust: Customer) => {
    setCustomerInfoState(cust);
    try {
      localStorage.setItem(CUSTOMER_STORAGE_KEY, JSON.stringify(cust));
    } catch (e) {
      console.error(e);
    }
  };

  // Order Handlers
  const refreshOrders = async () => {
    const freshOrders = await OrderRepository.getOrders();
    setOrders(freshOrders);
  };

  const updateOrderStatus = async (orderId: string, status: OrderStatus) => {
    await OrderRepository.updateOrderStatus(orderId, status);
    await refreshOrders();
  };

  const executeOrderAction = async (params: ExecuteActionParams) => {
    await OrderRepository.executeOrderAction(params);
    await refreshOrders();
  };

  return (
    <AppContext.Provider
      value={{
        businessId,
        business,
        isDemo,
        products,
        categories,
        catalogLoading,
        toggleProductAvailability,
        selectedProductForModal,
        openProductModal,
        closeProductModal,
        cart,
        isCartOpen,
        setIsCartOpen,
        addToCart,
        cartNotice,
        dismissCartNotice,
        updateCartItemQuantity,
        updateItemNotes,
        removeFromCart,
        clearCart,
        cartSubtotal,
        cartTotalCount,
        storeStatus,
        deliveryMethod,
        setDeliveryMethod,
        deliveryLocation,
        setDeliveryLocation,
        deliveryFeeResult,
        customerInfo,
        setCustomerInfo,
        orders,
        updateOrderStatus,
        executeOrderAction,
        refreshOrders,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
