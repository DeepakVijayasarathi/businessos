import { redirect } from 'next/navigation';

export default function HRIndexPage() {
  redirect('/dashboard/hr/employees');
}
