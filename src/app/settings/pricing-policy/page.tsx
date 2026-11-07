import PricingPolicy from "@/components/PricingPolicy";
import { createClient } from "@/lib/supabase/server";
import { pickActivePolicies, toDateString } from "@/lib/pricing/costResolver";
import { DEFAULT_COST_CHANGE_WARNING_THRESHOLD } from "@/lib/pricing/priceList";
import { connection } from "next/server";
import { redirect } from "next/navigation";

export default async function PricingPolicyPage() {
  await connection();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('user_profiles').select('role, is_active').eq('id', user.id).single();
  if (profile?.role !== 'admin' || !profile.is_active) {
    return <div className="p-8 text-center text-gray-500">報價政策僅限管理員設定。</div>;
  }

  const [{ data: policies }, { data: setting }] = await Promise.all([
    supabase.from('pricing_policies').select('*').order('created_at', { ascending: false }),
    supabase.from('system_settings').select('setting_value').eq('setting_key', 'cost_change_warning_threshold').maybeSingle(),
  ]);

  return (
    <div className="p-4 h-full flex flex-col">
      <PricingPolicy
        initialPolicies={pickActivePolicies(policies ?? [], toDateString(new Date()))}
        history={policies ?? []}
        threshold={setting?.setting_value != null ? String(setting.setting_value) : DEFAULT_COST_CHANGE_WARNING_THRESHOLD}
      />
    </div>
  );
}
