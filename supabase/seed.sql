-- ==========================================
-- seed.sql
-- Idempotent Initial Seed for 404 Pilot
-- ==========================================

-- Fixed UUIDs for predictable references (must use only hex chars 0-9, a-f)
DO $$
DECLARE
  v_biz_id UUID := 'b0000000-0000-0000-0000-000000000001';
  v_branch_id UUID := 'b0000000-0000-0000-0000-000000000002';
  v_branch_norte_id UUID := 'b0000000-0000-0000-0000-000000000003';

  v_cat_burgers UUID := 'c0000000-0000-0000-0000-000000000001';
  v_cat_combos UUID := 'c0000000-0000-0000-0000-000000000002';
  v_cat_starters UUID := 'c0000000-0000-0000-0000-000000000003';
  v_cat_postres UUID := 'c0000000-0000-0000-0000-000000000004';
  v_cat_drinks UUID := 'c0000000-0000-0000-0000-000000000005';

  v_grp_pan UUID := 'a0000000-0000-0000-0000-000000000001';
  v_grp_doneness UUID := 'a0000000-0000-0000-0000-000000000002';
  v_grp_extras UUID := 'a0000000-0000-0000-0000-000000000003';
  v_grp_sauces UUID := 'a0000000-0000-0000-0000-000000000004';

  v_prod_coffee_bacon UUID := 'd0000000-0000-0000-0000-000000000001';
  v_prod_maple_smoked UUID := 'd0000000-0000-0000-0000-000000000002';
  v_prod_crunchy UUID := 'd0000000-0000-0000-0000-000000000003';
  v_prod_404_clasica UUID := 'd0000000-0000-0000-0000-000000000004';
  v_prod_combo_404 UUID := 'd0000000-0000-0000-0000-000000000005';
  v_prod_combo_duo UUID := 'd0000000-0000-0000-0000-000000000006';
  v_prod_combo_familiar UUID := 'd0000000-0000-0000-0000-000000000007';
  v_prod_papas_404 UUID := 'd0000000-0000-0000-0000-000000000008';
  v_prod_aros_cebolla UUID := 'd0000000-0000-0000-0000-000000000009';
  v_prod_papas_clasicas UUID := 'd0000000-0000-0000-0000-00000000000a';
  v_prod_brownie_404 UUID := 'd0000000-0000-0000-0000-00000000000b';
  v_prod_volcan_chocolate UUID := 'd0000000-0000-0000-0000-00000000000c';
  v_prod_cheesecake_404 UUID := 'd0000000-0000-0000-0000-00000000000d';
  v_prod_limonada_404 UUID := 'd0000000-0000-0000-0000-00000000000e';
  v_prod_milkshake_404 UUID := 'd0000000-0000-0000-0000-00000000000f';
  v_prod_gaseosa_cola UUID := 'd0000000-0000-0000-0000-000000000010';
BEGIN

  -- 1. BUSINESS
  INSERT INTO businesses (id, name, slug, logo_url, cover_image_url, description, phone, whatsapp, currency, primary_color, secondary_color, timezone, active)
  VALUES (
    v_biz_id, '404', '404',
    '/demo/branding/logo-404.svg',
    '/demo/hero/hero-main.webp',
    'Hamburguesas premium, papas especiales, postres y bebidas de autor en Cuenca.',
    '0991234567', '0991234567', 'USD', '#0a0a0a', '#f5a623', 'America/Guayaquil', true
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    slug = EXCLUDED.slug,
    logo_url = EXCLUDED.logo_url,
    cover_image_url = EXCLUDED.cover_image_url,
    description = EXCLUDED.description,
    phone = EXCLUDED.phone,
    primary_color = EXCLUDED.primary_color,
    secondary_color = EXCLUDED.secondary_color;

  -- 2. BRANCHES
  INSERT INTO branches (id, business_id, name, address, latitude, longitude, phone, active)
  VALUES (
    v_branch_id, v_biz_id, '404 - Av. Juan Íñiguez',
    'Av. Juan Íñiguez V. 1-73, Cuenca, Ecuador', -2.8988, -79.0058, '0991234567', true
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    address = EXCLUDED.address,
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude;

  INSERT INTO branches (id, business_id, name, address, latitude, longitude, phone, active)
  VALUES (
    v_branch_norte_id, v_biz_id, '404 - Isla Mall del Alto',
    'Mall del Alto, Cuarta Planta - Zona Gastronómica, Cuenca, Ecuador', -2.8837, -79.0334, '0993334444', true
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    address = EXCLUDED.address,
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude;

  -- 3. CATEGORIES
  INSERT INTO categories (id, business_id, name, description, slug, icon, sort_order, active) VALUES
    (v_cat_burgers, v_biz_id, 'Hamburguesas', 'Smash burgers premium con blends de la casa y pan brioche dorado', 'hamburguesas', '🍔', 1, true),
    (v_cat_combos, v_biz_id, 'Combos', 'Combos armados para compartir, con papas y bebida incluidas', 'combos', '🔥', 2, true),
    (v_cat_starters, v_biz_id, 'Papas & Entradas', 'Papas especiales, aros de cebolla y entradas para acompañar', 'papas-entradas', '🍟', 3, true),
    (v_cat_postres, v_biz_id, 'Postres', 'Postres de autor para terminar en dulce', 'postres', '🍰', 4, true),
    (v_cat_drinks, v_biz_id, 'Bebidas', 'Bebidas, malteadas y refrescos bien helados', 'bebidas', '🥤', 5, true)
  ON CONFLICT (id) DO NOTHING;

  -- 4. MODIFIER GROUPS
  INSERT INTO modifier_groups (id, business_id, name, required, min_selections, max_selections, sort_order, active) VALUES
    (v_grp_pan, v_biz_id, 'Elige tu pan', true, 1, 1, 1, true),
    (v_grp_doneness, v_biz_id, 'Término de la carne', true, 1, 1, 2, true),
    (v_grp_extras, v_biz_id, 'Extras deliciosos', false, 0, 4, 3, true),
    (v_grp_sauces, v_biz_id, 'Salsas de la casa', false, 0, 3, 4, true)
  ON CONFLICT (id) DO NOTHING;

  -- 5. MODIFIERS
  INSERT INTO modifiers (id, business_id, modifier_group_id, name, price_delta, available, sort_order, active) VALUES
    ('e0000000-0000-0000-0000-000000000001', v_biz_id, v_grp_pan, 'Pan Brioche Clásico', 0.00, true, 1, true),
    ('e0000000-0000-0000-0000-000000000002', v_biz_id, v_grp_pan, 'Pan Negro de Carbón', 0.50, true, 2, true),
    ('e0000000-0000-0000-0000-000000000003', v_biz_id, v_grp_pan, 'Pan Pretzel Artesanal', 0.50, true, 3, true),
    ('e0000000-0000-0000-0000-000000000004', v_biz_id, v_grp_doneness, 'Bien Cocida', 0.00, true, 1, true),
    ('e0000000-0000-0000-0000-000000000005', v_biz_id, v_grp_doneness, 'Término Medio', 0.00, true, 2, true),
    ('e0000000-0000-0000-0000-000000000006', v_biz_id, v_grp_doneness, '3/4 Jugoso', 0.00, true, 3, true),
    ('e0000000-0000-0000-0000-000000000007', v_biz_id, v_grp_extras, 'Extra Queso Cheddar Fundido', 0.75, true, 1, true),
    ('e0000000-0000-0000-0000-000000000008', v_biz_id, v_grp_extras, 'Huevo Frito', 1.00, true, 2, true),
    ('e0000000-0000-0000-0000-000000000009', v_biz_id, v_grp_extras, 'Jalapeños Encurtidos', 0.35, true, 3, true),
    ('e0000000-0000-0000-0000-00000000000a', v_biz_id, v_grp_extras, 'Tocino Ahumado Extra', 0.90, true, 4, true),
    ('e0000000-0000-0000-0000-00000000000b', v_biz_id, v_grp_sauces, 'Salsa 404 Especial', 0.00, true, 1, true),
    ('e0000000-0000-0000-0000-00000000000c', v_biz_id, v_grp_sauces, 'BBQ Ahumada', 0.00, true, 2, true),
    ('e0000000-0000-0000-0000-00000000000d', v_biz_id, v_grp_sauces, 'Mayo Chipotle Cremosa', 0.25, true, 3, true)
  ON CONFLICT (id) DO NOTHING;

  -- 6. PRODUCTS
  INSERT INTO products (id, business_id, category_id, name, description, price, compare_at_price, image_url, active, available, featured, sort_order) VALUES
    (v_prod_coffee_bacon, v_biz_id, v_cat_burgers, 'Coffee Bacon', '180g de carne smashed, tocino ahumado, queso cheddar fundido y salsa de café ahumada sobre pan brioche dorado.', 8.50, 9.50, '/demo/products/burger-coffee-bacon.webp', true, true, true, 1),
    (v_prod_maple_smoked, v_biz_id, v_cat_burgers, 'Maple Smoked', 'Doble smash de carne, tocino caramelizado en almíbar de maple, queso cheddar ahumado y cebolla crispy en pan brioche.', 8.99, NULL, '/demo/products/burger-maple-smoked.webp', true, true, true, 2),
    (v_prod_crunchy, v_biz_id, v_cat_burgers, 'Crunchy', 'Pechuga de pollo crocante empanizada, coleslaw cremoso y salsa especial 404, servida en pan brioche suave.', 7.50, NULL, '/demo/products/burger-crunchy.webp', true, true, true, 3),
    (v_prod_404_clasica, v_biz_id, v_cat_burgers, '404 Clásica', 'La original: carne 100% de res a la parrilla, queso cheddar, lechuga, tomate y salsa 404 en pan brioche dorado.', 6.99, NULL, '/demo/products/hamburguesa-404-clasica.webp', true, true, false, 4),
    (v_prod_combo_404, v_biz_id, v_cat_combos, 'Combo 404', '1 Hamburguesa a elección + Papas 404 + Bebida a elección.', 12.99, 14.50, '/demo/products/combo-404.webp', true, true, true, 1),
    (v_prod_combo_duo, v_biz_id, v_cat_combos, 'Combo Dúo 404', '2 Hamburguesas Coffee Bacon + Papas grandes + 2 Bebidas a elección.', 17.99, 20.99, '/demo/products/combo-duo-404.webp', true, true, false, 2),
    (v_prod_combo_familiar, v_biz_id, v_cat_combos, 'Combo Familiar 404', '4 Hamburguesas surtidas + 2 Papas 404 grandes + 4 Bebidas a elección.', 34.99, 39.99, '/demo/products/combo-familiar-404.webp', true, true, true, 3),
    (v_prod_papas_404, v_biz_id, v_cat_starters, 'Papas 404', 'Papas rústicas doradas con parmesano, hierbas frescas y nuestra salsa 404.', 5.50, NULL, '/demo/products/papas-404.webp', true, true, true, 1),
    (v_prod_aros_cebolla, v_biz_id, v_cat_starters, 'Aros de Cebolla Crocantes', 'Aros de cebolla empanizados y fritos hasta quedar dorados, servidos con BBQ ahumada.', 4.99, NULL, '/demo/products/aros-de-cebolla.webp', true, true, false, 2),
    (v_prod_papas_clasicas, v_biz_id, v_cat_starters, 'Papas Clásicas', 'Papas fritas doradas y crocantes con sal marina.', 3.50, NULL, '/demo/products/papas-clasicas.webp', true, true, false, 3),
    (v_prod_brownie_404, v_biz_id, v_cat_postres, 'Brownie 404', 'Brownie de chocolate caliente bañado en salsa de chocolate.', 4.50, NULL, '/demo/products/brownie-404.webp', true, true, true, 1),
    (v_prod_volcan_chocolate, v_biz_id, v_cat_postres, 'Volcán de Chocolate', 'Brownie tibio con dos bolas de helado de vainilla y salsa de chocolate.', 5.50, NULL, '/demo/products/volcan-chocolate.webp', true, true, true, 2),
    (v_prod_cheesecake_404, v_biz_id, v_cat_postres, 'Cheesecake 404', 'Cheesecake cremoso con base de galleta y frutos rojos frescos.', 4.99, NULL, '/demo/products/cheesecake-404.webp', true, true, false, 3),
    (v_prod_limonada_404, v_biz_id, v_cat_drinks, 'Limonada 404', 'Limonada artesanal con un toque de romero fresco y hielo frappé.', 2.75, NULL, '/demo/products/limonada-404.webp', true, true, true, 1),
    (v_prod_milkshake_404, v_biz_id, v_cat_drinks, 'Milkshake 404', 'Malteada cremosa de galleta con crema batida y trozos de chocolate.', 4.50, NULL, '/demo/products/milkshake-404.webp', true, true, true, 2),
    (v_prod_gaseosa_cola, v_biz_id, v_cat_drinks, 'Gaseosa Cola Helada (500ml)', 'Bebida de cola helada servida con hielo y rodaja de limón.', 2.00, NULL, '/demo/products/gaseosa-cola.webp', true, true, false, 3)
  ON CONFLICT (id) DO NOTHING;

  -- 7. PRODUCT MODIFIER GROUPS LINK
  INSERT INTO product_modifier_groups (product_id, modifier_group_id, sort_order) VALUES
    (v_prod_coffee_bacon, v_grp_pan, 1),
    (v_prod_coffee_bacon, v_grp_doneness, 2),
    (v_prod_coffee_bacon, v_grp_extras, 3),
    (v_prod_coffee_bacon, v_grp_sauces, 4),
    (v_prod_maple_smoked, v_grp_doneness, 1),
    (v_prod_maple_smoked, v_grp_extras, 2),
    (v_prod_maple_smoked, v_grp_sauces, 3),
    (v_prod_crunchy, v_grp_extras, 1),
    (v_prod_crunchy, v_grp_sauces, 2),
    (v_prod_404_clasica, v_grp_pan, 1),
    (v_prod_404_clasica, v_grp_doneness, 2),
    (v_prod_404_clasica, v_grp_extras, 3),
    (v_prod_papas_404, v_grp_extras, 1),
    (v_prod_aros_cebolla, v_grp_sauces, 1)
  ON CONFLICT (product_id, modifier_group_id) DO NOTHING;

  -- 8. DELIVERY ZONES
  INSERT INTO delivery_zones (id, business_id, branch_id, name, max_distance_km, fee, estimated_min_minutes, estimated_max_minutes, sort_order, active) VALUES
    ('f0000000-0000-0000-0000-000000000001', v_biz_id, v_branch_id, 'Zona 1 - Cercana', 2.0, 1.50, 20, 30, 1, true),
    ('f0000000-0000-0000-0000-000000000002', v_biz_id, v_branch_id, 'Zona 2 - Media', 4.0, 2.00, 25, 35, 2, true),
    ('f0000000-0000-0000-0000-000000000003', v_biz_id, v_branch_id, 'Zona 3 - Extendida', 6.0, 2.50, 35, 45, 3, true),
    ('f0000000-0000-0000-0000-000000000004', v_biz_id, v_branch_norte_id, 'Mall del Alto - Cercana', 2.5, 1.75, 20, 30, 1, true),
    ('f0000000-0000-0000-0000-000000000005', v_biz_id, v_branch_norte_id, 'Mall del Alto - Extendida', 5.0, 2.75, 30, 40, 2, true)
  ON CONFLICT (id) DO NOTHING;

  -- 9. BUSINESS HOURS
  -- Av. Juan Íñiguez: Lun-Dom 12:00 - 22:00
  FOR dow IN 0..6 LOOP
    INSERT INTO business_hours (id, business_id, branch_id, day_of_week, open_time, close_time, closed)
    VALUES (
      uuid_generate_v4(), v_biz_id, v_branch_id, dow, '12:00:00'::TIME, '22:00:00'::TIME, false
    )
    ON CONFLICT (branch_id, day_of_week) DO UPDATE SET
      open_time = '12:00:00'::TIME,
      close_time = '22:00:00'::TIME,
      closed = false;
  END LOOP;

  -- Isla Mall del Alto: Lun-Dom 11:00 - 21:00
  FOR dow IN 0..6 LOOP
    INSERT INTO business_hours (id, business_id, branch_id, day_of_week, open_time, close_time, closed)
    VALUES (
      uuid_generate_v4(), v_biz_id, v_branch_norte_id, dow, '11:00:00'::TIME, '21:00:00'::TIME, false
    )
    ON CONFLICT (branch_id, day_of_week) DO UPDATE SET
      open_time = '11:00:00'::TIME,
      close_time = '21:00:00'::TIME,
      closed = false;
  END LOOP;

END $$;
