import { Business, Branch } from '@/types';

export const CURRENT_BUSINESS_ID = 'b0000000-0000-0000-0000-000000000001';

export const businessConfig: Business = {
  id: CURRENT_BUSINESS_ID,
  name: 'El Taca Nijo',
  slug: 'el-taca-nijo',
  slogan: 'Sabor que provoca volver',
  logo: 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&w=300&q=80',
  coverImage: '/demo/hero/hero-main.webp',
  description: 'Auténticos tacos mexicanos, smash burgers artesanales y antojos preparados al momento.',
  phone: '0991234567',
  whatsapp: '0991234567',
  currency: 'USD',
  currencySymbol: '$',
  primaryColor: '#e11d48',
  secondaryColor: '#f59e0b',
  timezone: 'America/Guayaquil',
  active: true,
  openingHours: 'Lun - Dom: 09:00 - 23:00',
  rating: 4.9,
  reviewCount: 142,
};

export const activeBranch: Branch = {
  id: 'b0000000-0000-0000-0000-000000000002',
  businessId: CURRENT_BUSINESS_ID,
  name: 'El Taca Nijo - Matriz Cuenca',
  address: 'Av. Remigio Crespo Toral y Agustín Cueva, Cuenca, Ecuador',
  latitude: -2.90055,
  longitude: -79.00453,
  phone: '0991234567',
  active: true,
};
