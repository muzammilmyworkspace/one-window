import CampaignEditor from '@/components/CampaignEditor'
import { PageHead } from '@/components/ui'
import { editorData } from '@/lib/editorData'
import { TEMPLATES } from '@/lib/seed'

export default async function NewCampaign() {
  const t = TEMPLATES[0]
  return (
    <>
      <PageHead title="New campaign" />
      <CampaignEditor {...await editorData()} templates={TEMPLATES}
        initial={{ name: t.name, subject: t.subject, preheader: t.preheader, html: t.html, states: [], follow_up_of: null, warmup: true, list_name: 'clients', reason: '', followup_key: 'email2', followup_days: 5 }} />
    </>
  )
}
