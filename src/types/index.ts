export type OrderStatus = 'new' | 'preparing' | 'ready' | 'on_the_way' | 'delivered' | 'cancelled';

// Legacy status mapping helper for UI display compatibility
export type LegacyOrderStatus = 'nuevo' | 'preparando' | 'listo' | 'en_camino' | 'entregado';

export type DeliveryMethod = 'delivery' | 'pickup';

export type LocationType = 'Casa' | 'Departamento' | 'Oficina' | 'Local comercial';

export type AdminRole = 'owner' | 'admin' | 'operator';

export type PaymentMethod = 'cash' | 'transfer' | 'online';

export interface CashChangeDetails {
  needsChange: boolean;
  payWith?: number;
}

export interface BankConfig {
  bankName: string;
  accountType: string;
  accountNumber: string;
  accountHolder: string;
  identification?: string;
  requireProof?: boolean;
}

export interface TransferDetails {
  proofUrl?: string;
  proofFileName?: string;
  proofMimeType?: string;
  proofFileSize?: number;
  proofUploadedAt?: string;
  verificationStatus?: 'pending' | 'verified' | 'rejected';
  proofPath?: string;
  bankName?: string;
  accountNumber?: string;
  accountHolder?: string;
}

export interface PaymentConfig {
  cashEnabled: boolean;
  transferEnabled: boolean;
  onlineEnabled: boolean;
  bankInfo: BankConfig;
}

export interface Business {
  id: string;
  name: string;
  slug: string;
  slogan?: string;
  logo: string;
  coverImage: string;
  description?: string;
  phone: string;
  whatsapp?: string;
  currency: string;
  currencySymbol: string;
  primaryColor: string;
  secondaryColor: string;
  timezone: string; // e.g. 'America/Guayaquil'
  active: boolean;
  openingHours?: string;
  rating?: number;
  reviewCount?: number;
  paymentConfig?: PaymentConfig;
}

export interface Branch {
  id: string;
  businessId: string;
  name: string;
  latitude: number;
  longitude: number;
  address: string;
  phone?: string;
  active?: boolean;
}

export interface Category {
  id: string;
  businessId: string;
  name: string;
  description?: string;
  slug: string;
  icon: string;
  sortOrder: number;
  active?: boolean;
}

export interface Modifier {
  id: string;
  businessId?: string;
  modifierGroupId?: string;
  name: string;
  price: number;
  isAvailable: boolean;
  active?: boolean;
}

export interface ModifierGroup {
  id: string;
  businessId?: string;
  name: string;
  required: boolean;
  minSelect?: number;
  maxSelect?: number;
  sortOrder?: number;
  modifiers: Modifier[];
}

export interface Product {
  id: string;
  businessId: string;
  categoryId: string;
  name: string;
  slug?: string;
  imagePrompt?: string;
  description: string;
  price: number;
  compareAtPrice?: number;
  image: string;
  isAvailable: boolean;
  active?: boolean;
  isPopular?: boolean;
  sortOrder?: number;
  modifierGroups?: ModifierGroup[];
}

export interface SelectedModifier {
  groupId: string;
  groupName: string;
  modifierId: string;
  modifierName: string;
  price: number;
}

export interface CartItem {
  id: string; // unique item instance id in cart
  product: Product;
  quantity: number;
  selectedModifiers: SelectedModifier[];
  notes?: string;
  unitPrice: number;
  totalPrice: number;
}

export interface DeliveryLocation {
  latitude: number;
  longitude: number;
  address: string;
  reference?: string;
  locationType: LocationType;
  zoneId?: string;
  deliveryFee?: number;
  estimatedMinutes?: string;
  hasSelectedLocation?: boolean;
}

export interface DeliveryQuote {
  available: boolean;
  isUnselected?: boolean;
  zoneId?: string;
  zoneName?: string;
  fee: number;
  estimatedMinutes?: string;
  distanceKm?: number;
  reason?: string;
}

export interface DeliveryCalculationParams {
  branchLatitude: number;
  branchLongitude: number;
  customerLatitude: number;
  customerLongitude: number;
}

export type DeliveryFeeResult = DeliveryQuote;

export interface Customer {
  id?: string;
  name: string;
  phone: string;
}

export interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  selectedModifiers: SelectedModifier[];
  notes?: string;
  totalPrice: number;
}

export interface Order {
  id: string;
  orderNumber: string; // e.g. "#1051"
  trackingToken: string; // Secure non-predictable token e.g. "trk_8f93a1..."
  businessId: string;
  branchId?: string;
  customer: Customer;
  deliveryMethod: DeliveryMethod;
  deliveryLocation?: DeliveryLocation;
  paymentMethod?: PaymentMethod;
  cashChange?: CashChangeDetails;
  transferDetails?: TransferDetails;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  status: OrderStatus;
  createdAt: string;
  estimatedTime: string;
  notes?: string;
}

export interface DeliveryZone {
  id: string;
  businessId: string;
  branchId?: string;
  name: string;
  maxDistanceKm: number;
  fee: number;
  estimatedMinutes: string;
  active?: boolean;
}

export interface BusinessHours {
  id?: string;
  businessId: string;
  branchId: string;
  dayOfWeek: number; // 0=Sunday, 1=Monday...
  openTime: string; // '09:00:00'
  closeTime: string; // '23:00:00'
  closed: boolean;
}

export interface Profile {
  id: string; // auth.users.id
  businessId: string;
  role: AdminRole;
  name: string;
  active: boolean;
}

export interface OrderStatusHistoryItem {
  id: string;
  orderId: string;
  businessId: string;
  fromStatus: OrderStatus;
  toStatus: OrderStatus;
  changedBy?: string;
  changedByName?: string;
  reason?: string;
  isRollback: boolean;
  createdAt: string;
}
