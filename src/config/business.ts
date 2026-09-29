import { Business, Branch } from '@/types';

export const CURRENT_BUSINESS_ID = 'b0000000-0000-0000-0000-000000000001';

export const businessConfig: Business = {
  id: CURRENT_BUSINESS_ID,
  name: '404',
  slug: '404',
  slogan: 'Burgers | fine dining & drinks',
  logo: '/demo/branding/logo-404.svg',
  coverImage: '/demo/hero/hero-main.webp',
  description: 'Hamburguesas premium, papas especiales, postres y bebidas de autor en Cuenca.',
  phone: '0991234567',
  whatsapp: '0991234567',
  currency: 'USD',
  currencySymbol: '$',
  primaryColor: '#0a0a0a',
  secondaryColor: '#f5a623',
  timezone: 'America/Guayaquil',
  active: true,
  openingHours: 'Lun - Dom: 12:00 - 22:00',
  rating: 4.8,
  reviewCount: 236,
  paymentConfig: {
    cashEnabled: true,
    transferEnabled: true,
    onlineEnabled: false,
    bankInfo: {
      bankName: 'Banco Pichincha',
      accountType: 'Cuenta de Ahorros',
      accountNumber: '2204567890',
      accountHolder: '404 Concept Cia. Ltda.',
      identification: '0190456789001',
      requireProof: false,
    },
  },
};

export const activeBranch: Branch = {
  id: 'b0000000-0000-0000-0000-000000000002',
  businessId: CURRENT_BUSINESS_ID,
  name: '404 - Av. Juan Íñiguez',
  address: 'Av. Juan Íñiguez V. 1-73, Cuenca, Ecuador',
  latitude: -2.8988,
  longitude: -79.0058,
  phone: '0991234567',
  active: true,
};
