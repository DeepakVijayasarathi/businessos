import { redirect } from 'next/navigation';

export default function CRMIndexPage() {
  redirect('/dashboard/crm/leads');
}
