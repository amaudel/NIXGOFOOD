'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
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
} from '@/types';
import { ProductRepository } from '@/repositories/ProductRepository';
import { OrderRepository } from '@/repositories/OrderRepository';
import { ExecuteActionParams } from '@/repositories/interfaces/IOrderRepository';
import { DeliveryService } from '@/services/DeliveryService';
import { DemoBroadcastService } from '@/services/DemoBroadcastService';
import { isDemoMode } from '@/config/demo';
import { useBranch } from '@/context/BranchContext';
import { getBusinessRepository } from '@/repositories/factory';

const CART_STORAGE_KEY = 'el_taca_nijo_cart';
const LOCATION_STORAGE_KEY = 'el_taca_nijo_location';
const DELIVERY_METHOD_KEY = 'el_taca_nijo_delivery_method';
const CUSTOMER_STORAGE_KEY = 'el_taca_nijo_customer';

interface AppContextType {
  // Tenant
  businessId: string;
  business: Business | null;

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
  updateCartItemQuantity: (id: string, delta: number) => void;
  updateItemNotes: (id: string, notes: string) => void;
  removeFromCart: (id: string) => void;
  clearCart: () => void;
  cartSubtotal: number;
  cartTotalCount: number;

  // Delivery & Location
  deliveryMethod: DeliveryMethod;
  setDeliveryMethod: (method: DeliveryMethod) => void;
  deliveryLocation: DeliveryLocation;
  setDeliveryLocation: (loc: DeliveryLocation) => void;
  deliveryFeeResult: DeliveryQuote;
  calculateDelivery: (lat: number, lng: number) => DeliveryQuote;

  // Customer
  customerInfo: Customer;
  setCustomerInfo: (cust: Customer) => void;

  // Orders
  orders: Order[];
  updateOrderStatus: (orderId: string, status: OrderStatus) => Promise<void>;
  executeOrderAction: (params: ExecuteActionParams) => Promise<void>;
  refreshOrders: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

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
  const { selectedBranch, autoSelectForLocation, zones, loading: branchLoading } = useBranch();

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
      const [catResult, prodResult, orderResult, businessResult] = await Promise.allSettled([
        ProductRepository.getCategories(businessId),
        ProductRepository.getAllProducts(businessId),
        OrderRepository.getOrders(businessId),
        getBusinessRepository().getBusiness(businessId),
      ]);

      if (catResult.status === 'fulfilled') setCategories(catResult.value);
      else console.error('Failed to load categories:', catResult.reason);

      if (prodResult.status === 'fulfilled') setProducts(prodResult.value);
      else console.error('Failed to load products:', prodResult.reason);

      if (orderResult.status === 'fulfilled') setOrders(orderResult.value);
      else console.error('Failed to load orders:', orderResult.reason);

      if (businessResult.status === 'fulfilled') setBusiness(businessResult.value);
      else console.error('Failed to load business:', businessResult.reason);

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
    if (isDemoMode()) {
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
    }
  }, []);

  // Sync Cart to LocalStorage
  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } catch (e) {
      console.error(e);
    }
  }, [cart]);

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
  const addToCart = (item: Omit<CartItem, 'id'>) => {
    const newItem: CartItem = {
      ...item,
      id: `${item.product.id}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    };
    setCart((prev) => [...prev, newItem]);
    setIsCartOpen(true);
  };

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

  const cotizarPara = (lat: number, lng: number): DeliveryQuote => {
    const cobertura = autoSelectForLocation(lat, lng);

    if (!cobertura || !cobertura.zone) {
      return {
        available: false,
        fee: 0,
        reason: 'Ninguna de nuestras sucursales llega a esta dirección. Puedes elegir retiro en local.',
      };
    }

    return cotizarParaSucursal(cobertura.branch, lat, lng);
  };

  const setDeliveryLocation = (loc: DeliveryLocation) => {
    const updatedLoc = { ...loc, hasSelectedLocation: true };
    setDeliveryLocationState(updatedLoc);
    setDeliveryFeeResult(cotizarPara(loc.latitude, loc.longitude));
    try {
      localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(updatedLoc));
    } catch (e) {
      console.error(e);
    }
  };

  const calculateDelivery = (lat: number, lng: number): DeliveryQuote => {
    setDeliveryLocationState((prev) => ({
      ...prev,
      latitude: lat,
      longitude: lng,
      hasSelectedLocation: true,
    }));
    const quote = cotizarPara(lat, lng);
    setDeliveryFeeResult(quote);
    return quote;
  };

  // Recalcula la cotizacion de delivery una vez que BranchContext termina de cargar
  // sucursales y zonas, para no cotizar contra un array de zonas todavia vacio.
  useEffect(() => {
    if (!branchLoading && deliveryLocation.hasSelectedLocation) {
      setDeliveryFeeResult(cotizarPara(deliveryLocation.latitude, deliveryLocation.longitude));
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
        updateCartItemQuantity,
        updateItemNotes,
        removeFromCart,
        clearCart,
        cartSubtotal,
        cartTotalCount,
        deliveryMethod,
        setDeliveryMethod,
        deliveryLocation,
        setDeliveryLocation,
        deliveryFeeResult,
        calculateDelivery,
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
