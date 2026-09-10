const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

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

console.log('--- TESTING LOYALTY OBJECTS EN SUPABASE ---');
console.log('Supabase URL:', supabaseUrl);

const supabase = createClient(supabaseUrl, supabaseKey);

async function runCheck() {
  for (const table of ['loyalty_programs', 'loyalty_accounts', 'loyalty_transactions']) {
    const { error } = await supabase.from(table).select('count', { count: 'exact', head: true });
    if (error) {
      console.log(`❌ TABLA ${table}:`, error.message);
    } else {
      console.log(`✅ TABLA ${table} EXISTE (RLS bloqueando SELECT directo es esperado con anon key)`);
    }
  }

  const { data, error: quoteErr } = await supabase.rpc('get_loyalty_quote', {
    p_business_id: '00000000-0000-0000-0000-000000000000',
    p_phone: '0000000000',
    p_subtotal: 10,
  });

  if (quoteErr) {
    console.log('❌ RPC get_loyalty_quote:', quoteErr.message);
  } else {
    console.log('✅ RPC get_loyalty_quote responde:', JSON.stringify(data));
  }

  const { error: orderErr } = await supabase.rpc('create_order', { p_payload: null });
  if (orderErr && orderErr.message.includes('INVALID_PARAM')) {
    console.log('✅ RPC create_order (version con fidelizacion) responde con la validacion esperada.');
  } else {
    console.log('ℹ️ RPC create_order respuesta inesperada:', orderErr ? orderErr.message : data);
  }
}

runCheck();
