-- ==========================================
-- seed.sql
-- Idempotent Initial Seed for El Taca Nijo Pilot
-- ==========================================

-- Fixed UUIDs for predictable references (must use only hex chars 0-9, a-f)
DO $$
DECLARE
  v_biz_id UUID := 'b0000000-0000-0000-0000-000000000001';
  v_branch_id UUID := 'b0000000-0000-0000-0000-000000000002';

  v_cat_tacos UUID := 'c0000000-0000-0000-0000-000000000001';
  v_cat_burgers UUID := 'c0000000-0000-0000-0000-000000000002';
  v_cat_combos UUID := 'c0000000-0000-0000-0000-000000000003';
  v_cat_starters UUID := 'c0000000-0000-0000-0000-000000000004';
  v_cat_drinks UUID := 'c0000000-0000-0000-0000-000000000005';

  v_grp_protein UUID := 'a0000000-0000-0000-0000-000000000001';
  v_grp_extras UUID := 'a0000000-0000-0000-0000-000000000002';
  v_grp_doneness UUID := 'a0000000-0000-0000-0000-000000000003';

  v_prod_taco_birria UUID := 'd0000000-0000-0000-0000-000000000001';
  v_prod_taco_pastor UUID := 'd0000000-0000-0000-0000-000000000002';
  v_prod_taco_cochinita UUID := 'd0000000-0000-0000-0000-000000000003';
  v_prod_burger_taca UUID := 'd0000000-0000-0000-0000-000000000004';
  v_prod_combo_fiesta UUID := 'd0000000-0000-0000-0000-000000000005';
  v_prod_nachos UUID := 'd0000000-0000-0000-0000-000000000006';
  v_prod_limonada UUID := 'd0000000-0000-0000-0000-000000000007';
  v_prod_coca_cola UUID := 'd0000000-0000-0000-0000-000000000008';
BEGIN

  -- 1. BUSINESS
  INSERT INTO businesses (id, name, slug, logo_url, cover_image_url, description, phone, whatsapp, currency, primary_color, secondary_color, timezone, active)
  VALUES (
    v_biz_id, 'El Taca Nijo', 'el-taca-nijo',
    'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&w=300&q=80',
    'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1600&q=80',
    'Sabor que provoca volver. Tacos, hamburguesas y antojos mexicanos.',
    '0991234567', '0991234567', 'USD', '#e11d48', '#f59e0b', 'America/Guayaquil', true
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    phone = EXCLUDED.phone;

  -- 2. BRANCH
  INSERT INTO branches (id, business_id, name, address, latitude, longitude, phone, active)
  VALUES (
    v_branch_id, v_biz_id, 'El Taca Nijo - Matriz',
    'Av. Los Shyris y Naciones Unidas, Quito', -0.180653, -78.467838, '0991234567', true
  )
  ON CONFLICT (id) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude;

  -- 3. CATEGORIES
  INSERT INTO categories (id, business_id, name, description, slug, icon, sort_order, active) VALUES
    (v_cat_tacos, v_biz_id, 'Tacos', 'Auténticos tacos mexicanos en tortilla de maíz', 'tacos', '🌮', 1, true),
    (v_cat_burgers, v_biz_id, 'Hamburguesas', 'Smashed burgers artesanales y pollo crispy', 'hamburguesas', '🍔', 2, true),
    (v_cat_combos, v_biz_id, 'Combos', 'Packs especiales para compartir', 'combos', '🔥', 3, true),
    (v_cat_starters, v_biz_id, 'Entradas', 'Nachos, quesadillas y papas con guacamole', 'entradas', '🥑', 4, true),
    (v_cat_drinks, v_biz_id, 'Bebidas', 'Limonadas caseras y gaseosas heladas', 'bebidas', '🥤', 5, true)
  ON CONFLICT (id) DO NOTHING;

  -- 4. MODIFIER GROUPS
  INSERT INTO modifier_groups (id, business_id, name, required, min_selections, max_selections, sort_order, active) VALUES
    (v_grp_protein, v_biz_id, 'Elige tu proteína', true, 1, 1, 1, true),
    (v_grp_extras, v_biz_id, 'Extras deliciosos', false, 0, 4, 2, true),
    (v_grp_doneness, v_biz_id, 'Término de la carne', true, 1, 1, 1, true)
  ON CONFLICT (id) DO NOTHING;

  -- 5. MODIFIERS
  INSERT INTO modifiers (id, business_id, modifier_group_id, name, price_delta, available, sort_order, active) VALUES
    ('e0000000-0000-0000-0000-000000000001', v_biz_id, v_grp_protein, 'Res Birria Tradicional', 0.00, true, 1, true),
    ('e0000000-0000-0000-0000-000000000002', v_biz_id, v_grp_protein, 'Cerdo Adobado', 0.00, true, 2, true),
    ('e0000000-0000-0000-0000-000000000003', v_biz_id, v_grp_protein, 'Pollo al Pastor', 0.00, true, 3, true),
    ('e0000000-0000-0000-0000-000000000004', v_biz_id, v_grp_extras, 'Extra Queso Oaxaca', 0.50, true, 1, true),
    ('e0000000-0000-0000-0000-000000000005', v_biz_id, v_grp_extras, 'Guacamole Casero', 0.75, true, 2, true),
    ('e0000000-0000-0000-0000-000000000006', v_biz_id, v_grp_extras, 'Jalapeños Asados', 0.25, true, 3, true),
    ('e0000000-0000-0000-0000-000000000007', v_biz_id, v_grp_doneness, 'Bien Cocida', 0.00, true, 1, true),
    ('e0000000-0000-0000-0000-000000000008', v_biz_id, v_grp_doneness, '3/4 Jugoso', 0.00, true, 2, true)
  ON CONFLICT (id) DO NOTHING;

  -- 6. PRODUCTS
  INSERT INTO products (id, business_id, category_id, name, description, price, compare_at_price, image_url, active, available, featured, sort_order) VALUES
    (v_prod_taco_birria, v_biz_id, v_cat_tacos, 'Taco Birria', 'Res marinada en chiles secos, queso derretido y consomé calientito.', 3.50, 4.00, 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&w=800&q=80', true, true, true, 1),
    (v_prod_taco_pastor, v_biz_id, v_cat_tacos, 'Taco al Pastor', 'Cerdo adobado al trompo con piña asada, cilantro y cebolla.', 3.25, NULL, 'https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?auto=format&fit=crop&w=800&q=80', true, true, true, 2),
    (v_prod_taco_cochinita, v_biz_id, v_cat_tacos, 'Taco Cochinita Pibil', 'Cerdo deshebrado en achiote con cebolla morada encurtida.', 3.50, NULL, 'https://images.unsplash.com/photo-1615870216519-2f9fa575fa5c?auto=format&fit=crop&w=800&q=80', true, true, false, 3),
    (v_prod_burger_taca, v_biz_id, v_cat_burgers, 'Hamburguesa Taca Nijo', '180g carne smashed, doble cheddar, tocino y cebolla caramelizada.', 7.50, 8.50, 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=800&q=80', true, true, true, 1),
    (v_prod_combo_fiesta, v_biz_id, v_cat_combos, 'Combo Taca Fiesta', '4 Tacos variados + 1 Nachos Especiales + 2 Bebidas.', 14.99, 17.50, 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=800&q=80', true, true, true, 1),
    (v_prod_nachos, v_biz_id, v_cat_starters, 'Nachos Especiales', 'Totopos crujientes con queso fundido, frijoles, guacamole y crema.', 6.50, NULL, 'https://images.unsplash.com/photo-1513456852971-30c0b8199d4d?auto=format&fit=crop&w=800&q=80', true, true, true, 1),
    (v_prod_limonada, v_biz_id, v_cat_drinks, 'Limonada Casera con Menta', 'Refrescante limonada recién exprimida con menta.', 2.50, NULL, 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=800&q=80', true, true, false, 1),
    (v_prod_coca_cola, v_biz_id, v_cat_drinks, 'Coca-Cola 500ml', 'Botella personal bien helada.', 2.00, NULL, 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=800&q=80', true, true, false, 2)
  ON CONFLICT (id) DO NOTHING;

  -- 7. PRODUCT MODIFIER GROUPS LINK
  INSERT INTO product_modifier_groups (product_id, modifier_group_id, sort_order) VALUES
    (v_prod_taco_birria, v_grp_protein, 1),
    (v_prod_taco_birria, v_grp_extras, 2),
    (v_prod_taco_pastor, v_grp_extras, 1),
    (v_prod_burger_taca, v_grp_doneness, 1),
    (v_prod_burger_taca, v_grp_extras, 2)
  ON CONFLICT (product_id, modifier_group_id) DO NOTHING;

  -- 8. DELIVERY ZONES
  INSERT INTO delivery_zones (id, business_id, branch_id, name, max_distance_km, fee, estimated_min_minutes, estimated_max_minutes, sort_order, active) VALUES
    ('f0000000-0000-0000-0000-000000000001', v_biz_id, v_branch_id, 'Zona 1 - Cercana', 2.0, 1.50, 20, 30, 1, true),
    ('f0000000-0000-0000-0000-000000000002', v_biz_id, v_branch_id, 'Zona 2 - Media', 4.0, 2.00, 25, 35, 2, true),
    ('f0000000-0000-0000-0000-000000000003', v_biz_id, v_branch_id, 'Zona 3 - Extendida', 6.0, 2.50, 35, 45, 3, true)
  ON CONFLICT (id) DO NOTHING;

  -- 9. BUSINESS HOURS (Open Mon-Sun 09:00 to 23:00)
  FOR dow IN 0..6 LOOP
    INSERT INTO business_hours (id, business_id, branch_id, day_of_week, open_time, close_time, closed)
    VALUES (
      uuid_generate_v4(), v_biz_id, v_branch_id, dow, '09:00:00'::TIME, '23:00:00'::TIME, false
    )
    ON CONFLICT (branch_id, day_of_week) DO UPDATE SET
      open_time = '09:00:00'::TIME,
      close_time = '23:00:00'::TIME,
      closed = false;
  END LOOP;

END $$;
