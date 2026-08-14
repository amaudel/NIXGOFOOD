import { isDemoMode } from '@/config/demo';
import { IProductRepository } from './interfaces/IProductRepository';
import { IOrderRepository } from './interfaces/IOrderRepository';
import { IBusinessRepository } from './interfaces/IBusinessRepository';

import { DemoProductRepository } from './demo/DemoProductRepository';
import { DemoOrderRepository } from './demo/DemoOrderRepository';
import { DemoBusinessRepository } from './demo/DemoBusinessRepository';

import { SupabaseProductRepository } from './supabase/SupabaseProductRepository';
import { SupabaseOrderRepository } from './supabase/SupabaseOrderRepository';
import { SupabaseBusinessRepository } from './supabase/SupabaseBusinessRepository';

// Singletons
let demoProductRepo: DemoProductRepository | null = null;
let supabaseProductRepo: SupabaseProductRepository | null = null;

let demoOrderRepo: DemoOrderRepository | null = null;
let supabaseOrderRepo: SupabaseOrderRepository | null = null;

let demoBusinessRepo: DemoBusinessRepository | null = null;
let supabaseBusinessRepo: SupabaseBusinessRepository | null = null;

export function getProductRepository(): IProductRepository {
  if (isDemoMode()) {
    if (!demoProductRepo) demoProductRepo = new DemoProductRepository();
    return demoProductRepo;
  }
  if (!supabaseProductRepo) supabaseProductRepo = new SupabaseProductRepository();
  return supabaseProductRepo;
}

export function getOrderRepository(): IOrderRepository {
  if (isDemoMode()) {
    if (!demoOrderRepo) demoOrderRepo = new DemoOrderRepository();
    return demoOrderRepo;
  }
  if (!supabaseOrderRepo) supabaseOrderRepo = new SupabaseOrderRepository();
  return supabaseOrderRepo;
}

export function getBusinessRepository(): IBusinessRepository {
  if (isDemoMode()) {
    if (!demoBusinessRepo) demoBusinessRepo = new DemoBusinessRepository();
    return demoBusinessRepo;
  }
  if (!supabaseBusinessRepo) supabaseBusinessRepo = new SupabaseBusinessRepository();
  return supabaseBusinessRepo;
}
