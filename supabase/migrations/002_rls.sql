-- ==========================================
-- 002_rls.sql
-- Row Level Security & Storage Policies
-- ==========================================

-- ENABLE ROW LEVEL SECURITY ON ALL TABLES
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE modifier_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE modifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_modifier_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_item_modifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- HELPER FUNCTION TO GET CURRENT AUTHENTICATED USER'S BUSINESS_ID
CREATE OR REPLACE FUNCTION current_user_business_id()
RETURNS UUID AS $$
  SELECT business_id FROM profiles WHERE id = auth.uid() AND active = true LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 1. PUBLIC / ANON READ POLICIES
CREATE POLICY "Public read active businesses" ON businesses FOR SELECT USING (active = true);
CREATE POLICY "Public read active branches" ON branches FOR SELECT USING (active = true);
CREATE POLICY "Public read active categories" ON categories FOR SELECT USING (active = true);
CREATE POLICY "Public read active products" ON products FOR SELECT USING (active = true);
CREATE POLICY "Public read active modifier_groups" ON modifier_groups FOR SELECT USING (active = true);
CREATE POLICY "Public read active modifiers" ON modifiers FOR SELECT USING (active = true);
CREATE POLICY "Public read product_modifier_groups" ON product_modifier_groups FOR SELECT USING (true);
CREATE POLICY "Public read active delivery_zones" ON delivery_zones FOR SELECT USING (active = true);
CREATE POLICY "Public read business_hours" ON business_hours FOR SELECT USING (true);

-- 2. PROFILES POLICIES
CREATE POLICY "Users can read own profile" ON profiles FOR SELECT USING (id = auth.uid());

-- 3. AUTHENTICATED ADMIN ALL-OPERATIONS POLICIES (MATCHING PROFILE BUSINESS_ID)
CREATE POLICY "Admin manage business" ON businesses FOR ALL USING (id = current_user_business_id());
CREATE POLICY "Admin manage branches" ON branches FOR ALL USING (business_id = current_user_business_id());
CREATE POLICY "Admin manage categories" ON categories FOR ALL USING (business_id = current_user_business_id());
CREATE POLICY "Admin manage products" ON products FOR ALL USING (business_id = current_user_business_id());
CREATE POLICY "Admin manage modifier_groups" ON modifier_groups FOR ALL USING (business_id = current_user_business_id());
CREATE POLICY "Admin manage modifiers" ON modifiers FOR ALL USING (business_id = current_user_business_id());
CREATE POLICY "Admin manage product_modifier_groups" ON product_modifier_groups FOR ALL USING (
  product_id IN (SELECT id FROM products WHERE business_id = current_user_business_id())
);
CREATE POLICY "Admin manage delivery_zones" ON delivery_zones FOR ALL USING (business_id = current_user_business_id());
CREATE POLICY "Admin manage business_hours" ON business_hours FOR ALL USING (business_id = current_user_business_id());
CREATE POLICY "Admin manage customers" ON customers FOR ALL USING (business_id = current_user_business_id());
CREATE POLICY "Admin manage orders" ON orders FOR ALL USING (business_id = current_user_business_id());
CREATE POLICY "Admin manage order_items" ON order_items FOR ALL USING (
  order_id IN (SELECT id FROM orders WHERE business_id = current_user_business_id())
);
CREATE POLICY "Admin manage order_item_modifiers" ON order_item_modifiers FOR ALL USING (
  order_item_id IN (SELECT id FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE business_id = current_user_business_id()))
);

-- ==========================================
-- SUPABASE STORAGE BUCKET POLICIES (restaurant-media)
-- ==========================================
INSERT INTO storage.buckets (id, name, public) 
VALUES ('restaurant-media', 'restaurant-media', true)
ON CONFLICT (id) DO NOTHING;

-- Public read for all images in restaurant-media
CREATE POLICY "Public read restaurant-media" ON storage.objects 
FOR SELECT USING (bucket_id = 'restaurant-media');

-- Authenticated admins upload/manage images under their businessId folder
CREATE POLICY "Admin upload restaurant-media" ON storage.objects 
FOR INSERT WITH CHECK (
  bucket_id = 'restaurant-media' 
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = current_user_business_id()::text
);

CREATE POLICY "Admin delete restaurant-media" ON storage.objects 
FOR DELETE USING (
  bucket_id = 'restaurant-media' 
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = current_user_business_id()::text
);
