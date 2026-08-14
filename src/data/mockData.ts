import { Category, Product, Order } from '@/types';
import { CURRENT_BUSINESS_ID } from '@/config/business';

export const initialCategories: Category[] = [
  { id: 'cat_tacos', businessId: CURRENT_BUSINESS_ID, name: 'Tacos', slug: 'tacos', icon: '🌮', sortOrder: 1 },
  { id: 'cat_hamburguesas', businessId: CURRENT_BUSINESS_ID, name: 'Hamburguesas', slug: 'hamburguesas', icon: '🍔', sortOrder: 2 },
  { id: 'cat_combos', businessId: CURRENT_BUSINESS_ID, name: 'Combos', slug: 'combos', icon: '🔥', sortOrder: 3 },
  { id: 'cat_entradas', businessId: CURRENT_BUSINESS_ID, name: 'Entradas', slug: 'entradas', icon: '🥑', sortOrder: 4 },
  { id: 'cat_bebidas', businessId: CURRENT_BUSINESS_ID, name: 'Bebidas', slug: 'bebidas', icon: '🥤', sortOrder: 5 },
];

export const initialProducts: Product[] = [
  // Tacos
  {
    id: 'prod_taco_birria',
    businessId: CURRENT_BUSINESS_ID,
    categoryId: 'cat_tacos',
    name: 'Taco Birria',
    description: 'Tortilla artesanal de maíz, res marinada en chiles secos, queso derretido y consomé calientito.',
    price: 3.50,
    image: 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&w=800&q=80',
    isAvailable: true,
    isPopular: true,
    modifierGroups: [
      {
        id: 'grp_protein',
        name: 'Elige tu proteína',
        required: true,
        modifiers: [
          { id: 'mod_birria_res', name: 'Res Birria Tradicional', price: 0, isAvailable: true },
          { id: 'mod_birria_cerdo', name: 'Cerdo Adobado', price: 0, isAvailable: true },
          { id: 'mod_birria_pollo', name: 'Pollo al Pastor', price: 0, isAvailable: true },
        ],
      },
      {
        id: 'grp_extras',
        name: 'Extras deliciosos',
        required: false,
        maxSelect: 4,
        modifiers: [
          { id: 'mod_queso', name: 'Extra Queso Oaxaca Fundido', price: 0.75, isAvailable: true },
          { id: 'mod_guac', name: 'Guacamole Casero (porción)', price: 1.00, isAvailable: true },
          { id: 'mod_jalapeno', name: 'Jalapeños Asados', price: 0.35, isAvailable: true },
          { id: 'mod_tocino', name: 'Tocino Crujiente', price: 0.90, isAvailable: true },
        ],
      },
    ],
  },
  {
    id: 'prod_taco_pastor',
    businessId: CURRENT_BUSINESS_ID,
    categoryId: 'cat_tacos',
    name: 'Taco al Pastor',
    description: 'Cerdo marinado en trompo, piña asada, cebolla y cilantro.',
    price: 3.25,
    image: 'https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?auto=format&fit=crop&w=800&q=80',
    isAvailable: true,
    isPopular: true,
    modifierGroups: [
      {
        id: 'grp_extras',
        name: 'Extras deliciosos',
        required: false,
        maxSelect: 4,
        modifiers: [
          { id: 'mod_queso', name: 'Extra Queso Oaxaca Fundido', price: 0.75, isAvailable: true },
          { id: 'mod_guac', name: 'Guacamole Casero (porción)', price: 1.00, isAvailable: true },
          { id: 'mod_jalapeno', name: 'Jalapeños Asados', price: 0.35, isAvailable: true },
        ],
      },
    ],
  },

  // Hamburguesas
  {
    id: 'prod_burger_smash',
    businessId: CURRENT_BUSINESS_ID,
    categoryId: 'cat_hamburguesas',
    name: 'Smash Burger Doble',
    description: 'Doble carne smashed 100% res, doble queso cheddar, tocino ahumado y salsa especial en pan brioche.',
    price: 7.50,
    image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=800&q=80',
    isAvailable: true,
    isPopular: true,
    modifierGroups: [
      {
        id: 'grp_doneness',
        name: 'Término de la carne',
        required: true,
        modifiers: [
          { id: 'mod_bien_cocido', name: 'Bien Cocido', price: 0, isAvailable: true },
          { id: 'mod_tres_cuartos', name: '3/4 Jugoso', price: 0, isAvailable: true },
          { id: 'mod_medio', name: 'Término Medio', price: 0, isAvailable: true },
        ],
      },
      {
        id: 'grp_extras_burger',
        name: 'Extras para tu Burger',
        required: false,
        modifiers: [
          { id: 'mod_carne_extra', name: 'Carne Extra Smashed (90g)', price: 2.00, isAvailable: true },
          { id: 'mod_queso_extra', name: 'Extra Queso Cheddar', price: 0.75, isAvailable: true },
          { id: 'mod_huevo', name: 'Huevo Frito a la Plancha', price: 0.85, isAvailable: true },
        ],
      },
    ],
  },
  {
    id: 'prod_burger_chicken',
    businessId: CURRENT_BUSINESS_ID,
    categoryId: 'cat_hamburguesas',
    name: 'Crispy Chicken Burger',
    description: 'Pechuga empanizada estilo sureño, col sazonada, pepinillos y mayonesa chipotle.',
    price: 6.99,
    image: 'https://images.unsplash.com/photo-1625813506062-0aeb1d7a094b?auto=format&fit=crop&w=800&q=80',
    isAvailable: true,
    isPopular: false,
    modifierGroups: [
      {
        id: 'grp_extras_burger',
        name: 'Extras para tu Burger',
        required: false,
        modifiers: [
          { id: 'mod_queso_extra', name: 'Extra Queso Cheddar', price: 0.75, isAvailable: true },
          { id: 'mod_tocino', name: 'Tocino Crujiente', price: 0.90, isAvailable: true },
        ],
      },
    ],
  },

  // Combos
  {
    id: 'prod_combo_taca',
    businessId: CURRENT_BUSINESS_ID,
    categoryId: 'cat_combos',
    name: 'Combo Taca Familiar (3-4 personas)',
    description: '6 Tacos variados, 1 Smash Burger Doble, Papas rústicas grandes y 2 Bebidas a elección.',
    price: 18.50,
    image: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=800&q=80',
    isAvailable: true,
    isPopular: true,
  },

  // Entradas
  {
    id: 'prod_nachos_especiales',
    businessId: CURRENT_BUSINESS_ID,
    categoryId: 'cat_entradas',
    name: 'Nachos Especiales El Taca',
    description: 'Totopos crujientes con bañado de queso cheddar caliente, frijoles refritos, pico de gallo y guacamole.',
    price: 6.50,
    image: 'https://images.unsplash.com/photo-1513456852971-30c0b8199d4d?auto=format&fit=crop&w=800&q=80',
    isAvailable: true,
    isPopular: true,
  },

  // Bebidas
  {
    id: 'prod_horchata',
    businessId: CURRENT_BUSINESS_ID,
    categoryId: 'cat_bebidas',
    name: 'Agua de Horchata Mexicana (500ml)',
    description: 'Bebida artesanal refrescante de arroz, canela y leche servida bien fría.',
    price: 2.50,
    image: 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=800&q=80',
    isAvailable: true,
    isPopular: true,
  },
  {
    id: 'prod_limonada',
    businessId: CURRENT_BUSINESS_ID,
    categoryId: 'cat_bebidas',
    name: 'Limonada de Menta (500ml)',
    description: 'Limón recién exprimido con menta fresca frappé.',
    price: 2.25,
    image: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=800&q=80',
    isAvailable: true,
    isPopular: false,
  },
];

export const initialOrders: Order[] = [
  {
    id: 'ord_1048',
    orderNumber: '#1048',
    trackingToken: 'token_demo_1048',
    businessId: CURRENT_BUSINESS_ID,
    branchId: 'b0000000-0000-0000-0000-000000000002',
    customer: {
      id: 'cust_1',
      name: 'María Fernández',
      phone: '0991112233',
    },
    deliveryMethod: 'delivery',
    deliveryLocation: {
      latitude: -2.898,
      longitude: -79.002,
      address: 'Av. Remigio Crespo, Cuenca',
      reference: 'Frente al parque',
      locationType: 'Casa',
      zoneId: 'z0000000-0000-0000-0000-000000000001',
      deliveryFee: 1.50,
      estimatedMinutes: '20-30 min',
    },
    items: [
      {
        id: 'item_1',
        productId: 'prod_taco_birria',
        productName: 'Taco Birria',
        unitPrice: 3.50,
        quantity: 2,
        selectedModifiers: [
          { groupId: 'grp_extras', groupName: 'Extras', modifierId: 'mod_queso', modifierName: 'Extra Queso Oaxaca Fundido', price: 0.75 },
        ],
        notes: 'Sin cebolla',
        totalPrice: 8.50,
      },
      {
        id: 'item_2',
        productId: 'prod_horchata',
        productName: 'Agua de Horchata Mexicana (500ml)',
        unitPrice: 2.50,
        quantity: 1,
        selectedModifiers: [],
        totalPrice: 2.50,
      },
    ],
    subtotal: 11.00,
    deliveryFee: 1.50,
    total: 12.50,
    status: 'delivered',
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    estimatedTime: '20-30 min',
  },
];
