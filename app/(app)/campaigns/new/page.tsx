import CampaignEditor from '@/components/CampaignEditor'
import { PageHead } from '@/components/ui'
import { editorData } from '@/lib/editorData'
import { stateName } from '@/lib/lists'
import { TEMPLATES } from '@/lib/seed'

export default async function NewCampaign({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const data = await editorData()
  const wanted = (await searchParams).state
  const state = data.states.find((s) => s.code === wanted)?.code
  const month = new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  return (
    <>
      <PageHead title="New campaign" />
      <CampaignEditor {...data} templates={TEMPLATES} startStep={state ? 1 : 0}
        initial={{ name: state ? `${stateName(state)}, ${month}` : '', subject: '', preheader: '', html: '', states: state ? [state] : [], follow_up_of: null, warmup: true, list_name: '', reason: '', followup_key: 'email2', followup_days: 5, sequence: [] }} />
    </>
  )
}
