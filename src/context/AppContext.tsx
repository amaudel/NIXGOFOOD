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
} from '@/types';
import { initialCategories, initialProducts } from '@/data/mockData';
import { ProductRepository } from '@/repositories/ProductRepository';
import { OrderRepository } from '@/repositories/OrderRepository';
import { DeliveryService } from '@/services/DeliveryService';
import { activeBranch } from '@/config/business';
import { DemoBroadcastService } from '@/services/DemoBroadcastService';

const CART_STORAGE_KEY = 'el_taca_nijo_cart';
const LOCATION_STORAGE_KEY = 'el_taca_nijo_location';
const DELIVERY_METHOD_KEY = 'el_taca_nijo_delivery_method';
const CUSTOMER_STORAGE_KEY = 'el_taca_nijo_customer';

interface AppContextType {
  // Catalog
  products: Product[];
  categories: Category[];
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
  refreshOrders: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const DEFAULT_LOCATION: DeliveryLocation = {
  latitude: -0.180653,
  longitude: -78.467838,
  address: 'Av. Los Shyris y Naciones Unidas, Quito',
  locationType: 'Casa',
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // State
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [selectedProductForModal, setSelectedProductForModal] = useState<Product | null>(null);
  
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);

  const [deliveryMethod, setDeliveryMethodState] = useState<DeliveryMethod>('delivery');
  const [deliveryLocation, setDeliveryLocationState] = useState<DeliveryLocation>(DEFAULT_LOCATION);
  const [deliveryFeeResult, setDeliveryFeeResult] = useState<DeliveryQuote>(() =>
    DeliveryService.calculateDeliveryFee({
      branchLatitude: activeBranch.latitude,
      branchLongitude: activeBranch.longitude,
      customerLatitude: DEFAULT_LOCATION.latitude,
      customerLongitude: DEFAULT_LOCATION.longitude,
    })
  );

  const [customerInfo, setCustomerInfoState] = useState<Customer>({ name: '', phone: '' });
  const [orders, setOrders] = useState<Order[]>([]);

  // Initialize from Repositories & LocalStorage on Client Hydration
  useEffect(() => {
    async function initCatalogAndOrders() {
      try {
        const [fetchedCats, fetchedProds, fetchedOrders] = await Promise.all([
          ProductRepository.getCategories(),
          ProductRepository.getAllProducts(),
          OrderRepository.getOrders(),
        ]);
        if (fetchedCats && fetchedCats.length > 0) setCategories(fetchedCats);
        if (fetchedProds && fetchedProds.length > 0) setProducts(fetchedProds);
        if (fetchedOrders) setOrders(fetchedOrders);
      } catch (e) {
        console.error('Failed to initialize data from repository:', e);
      }
    }

    initCatalogAndOrders();

    // Subscribe to DemoBroadcastService events across tabs
    const unsubscribeBroadcast = DemoBroadcastService.subscribe((msg) => {
      if (
        msg.type === 'PRODUCT_UPDATED' ||
        msg.type === 'BUSINESS_SETTINGS_UPDATED' ||
        msg.type === 'NEW_ORDER_CREATED' ||
        msg.type === 'DEMO_RESET'
      ) {
        initCatalogAndOrders();
      }
    });

    // Cart
    try {
      const savedCart = localStorage.getItem(CART_STORAGE_KEY);
      if (savedCart) setCart(JSON.parse(savedCart));
    } catch (e) {
      console.error('Failed to load cart', e);
    }

    // Delivery Method
    try {
      const savedMethod = localStorage.getItem(DELIVERY_METHOD_KEY) as DeliveryMethod;
      if (savedMethod) setDeliveryMethodState(savedMethod);
    } catch (e) {
      console.error('Failed to load delivery method', e);
    }

    // Location
    try {
      const savedLoc = localStorage.getItem(LOCATION_STORAGE_KEY);
      if (savedLoc) {
        const parsedLoc = JSON.parse(savedLoc);
        setDeliveryLocationState(parsedLoc);
        const quote = DeliveryService.calculateDeliveryFee({
          branchLatitude: activeBranch.latitude,
          branchLongitude: activeBranch.longitude,
          customerLatitude: parsedLoc.latitude,
          customerLongitude: parsedLoc.longitude,
        });
        setDeliveryFeeResult(quote);
      }
    } catch (e) {
      console.error('Failed to load location', e);
    }

    // Customer Info
    try {
      const savedCust = localStorage.getItem(CUSTOMER_STORAGE_KEY);
      if (savedCust) setCustomerInfoState(JSON.parse(savedCust));
    } catch (e) {
      console.error('Failed to load customer info', e);
    }

    return () => {
      unsubscribeBroadcast();
    };
  }, []);

  // Save Cart to LocalStorage
  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } catch (e) {
      console.error('Failed to save cart', e);
    }
  }, [cart]);

  // Product Availability Handler
  const toggleProductAvailability = async (productId: string, isAvailable: boolean) => {
    await ProductRepository.setProductAvailability(productId, isAvailable);
    const updated = await ProductRepository.getAllProducts();
    setProducts(updated);
  };

  // Modal Handlers
  const openProductModal = (product: Product) => {
    setSelectedProductForModal(product);
  };

  const closeProductModal = () => {
    setSelectedProductForModal(null);
  };

  // Cart Operations
  const addToCart = (newItem: Omit<CartItem, 'id'>) => {
    const instanceId = `item_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    setCart((prev) => [...prev, { ...newItem, id: instanceId }]);
  };

  const updateCartItemQuantity = (id: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.id === id) {
            const newQty = item.quantity + delta;
            if (newQty <= 0) return null;
            return {
              ...item,
              quantity: newQty,
              totalPrice: item.unitPrice * newQty,
            };
          }
          return item;
        })
        .filter(Boolean) as CartItem[]
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
      console.error('Failed to clear cart storage', e);
    }
  };

  const cartSubtotal = cart.reduce((sum, item) => sum + item.totalPrice, 0);
  const cartTotalCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  // Delivery Handlers
  const setDeliveryMethod = (method: DeliveryMethod) => {
    setDeliveryMethodState(method);
    try {
      localStorage.setItem(DELIVERY_METHOD_KEY, method);
    } catch (e) {
      console.error(e);
    }
  };

  const setDeliveryLocation = (loc: DeliveryLocation) => {
    setDeliveryLocationState(loc);
    const quote = DeliveryService.calculateDeliveryFee({
      branchLatitude: activeBranch.latitude,
      branchLongitude: activeBranch.longitude,
      customerLatitude: loc.latitude,
      customerLongitude: loc.longitude,
    });
    setDeliveryFeeResult(quote);
    try {
      localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(loc));
    } catch (e) {
      console.error(e);
    }
  };

  const calculateDelivery = (lat: number, lng: number): DeliveryQuote => {
    const quote = DeliveryService.calculateDeliveryFee({
      branchLatitude: activeBranch.latitude,
      branchLongitude: activeBranch.longitude,
      customerLatitude: lat,
      customerLongitude: lng,
    });
    setDeliveryFeeResult(quote);
    return quote;
  };

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

  return (
    <AppContext.Provider
      value={{
        products,
        categories,
        toggleProductAvailability,
        selectedProductForModal,
        openProductModal,
        closeProductModal,
        cart,
        isCartOpen,
        setIsCartOpen,
        addToCart,
        updateCartItemQuantity,
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
        refreshOrders,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within an AppProvider');
  return context;
};
