import fs from 'fs';
import path from 'path';

const planPath = path.join(process.cwd(), 'testsprite_tests', 'testsprite_frontend_test_plan.json');
const ALLOWED_IDS = ['TC001', 'TC002', 'TC004', 'TC005', 'TC006', 'TC007', 'TC010', 'TC013', 'TC014', 'TC019'];

if (fs.existsSync(planPath)) {
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf-8'));
  const filtered = plan.filter((item: any) => ALLOWED_IDS.includes(item.id));
  fs.writeFileSync(planPath, JSON.stringify(filtered, null, 2));
  console.log(`✓ Filtered test plan to ${filtered.length} approved test cases:`, ALLOWED_IDS.join(', '));
} else {
  console.error('Test plan file not found!');
}
