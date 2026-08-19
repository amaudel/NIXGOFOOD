const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Parse .env.production.local manually
const envPath = path.join(__dirname, '..', '.env.production.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = {};
envContent.split('\n').forEach((line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    const key = match[1].trim();
    let val = match[2].trim();
    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1);
    }
    envVars[key] = val;
  }
});

const supabaseUrl = envVars['NEXT_PUBLIC_SUPABASE_URL'];
const supabaseKey = envVars['NEXT_PUBLIC_SUPABASE_ANON_KEY'];

console.log('--- TESTING SUPABASE PRODUCTION OBJECTS ---');
console.log('Supabase URL:', supabaseUrl);

const supabase = createClient(supabaseUrl, supabaseKey);

async function runCheck() {
  try {
    // 1. Check order_status_history table
    const { data: historyData, error: historyErr } = await supabase
      .from('order_status_history')
      .select('count', { count: 'exact', head: true });

    if (historyErr) {
      console.log('❌ TABLE order_status_history CHECK:', historyErr.message);
    } else {
      console.log('✅ TABLE order_status_history EXISTS in Supabase Production!');
    }

    // 2. Check RPC rollback_order_status by calling with invalid dummy UUID
    const { data: rpcData, error: rpcErr } = await supabase.rpc('rollback_order_status', {
      p_order_id: '00000000-0000-0000-0000-000000000000',
      p_expected_status: 'ready',
      p_target_status: 'preparing',
    });

    if (rpcErr) {
      console.log('RPC Call Output:', rpcErr.message);
      if (rpcErr.message.includes('function') && rpcErr.message.includes('does not exist')) {
        console.log('❌ RPC rollback_order_status DOES NOT EXIST in Supabase Production!');
      } else if (rpcErr.message.includes('UNAUTHORIZED') || rpcErr.message.includes('FORBIDDEN') || rpcErr.message.includes('NOT_FOUND')) {
        console.log('✅ RPC rollback_order_status EXISTS and is active with SECURITY DEFINER checks!');
      } else {
        console.log('ℹ️ RPC Output:', rpcErr.message);
      }
    } else {
      console.log('✅ RPC Response:', rpcData);
    }
  } catch (err) {
    console.error('Check Error:', err);
  }
}

runCheck();
