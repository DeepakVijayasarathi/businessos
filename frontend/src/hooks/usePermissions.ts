import { useAuthStore } from '@/store/auth.store';

// Map module name → legacy coarse permissions that imply access
// Used for backward compatibility with roles created before module.* perms
const LEGACY: Record<string, string[]> = {
  crm:           ['crm.*', 'crm.leads.*', 'crm.contacts.*', 'crm.deals.*'],
  hr:            ['hr.*'],
  projects:      ['projects.*', 'tasks.*'],
  finance:       ['finance.*'],
  clients:       ['crm.*', 'clients.*'],
  helpdesk:      ['helpdesk.*'],
  knowledgebase: ['knowledge.*', 'knowledgebase.*'],
  documents:     ['documents.*'],
  intelligence:  ['ai.*', 'analytics.*'],
  ai:            ['ai.*'],
  workflow:      ['workflow.*'],
  appointments:  ['appointments.*'],
  whatsapp:      ['whatsapp.*'],
  email:         ['email.*'],
  marketing:     ['marketing.*'],
  analytics:     ['analytics.*'],
  settings:      ['settings.*', 'roles.*'],
};

// These modules are always visible regardless of role
const ALWAYS_ON = new Set(['dashboard', 'messages']);

export function usePermissions() {
  const user = useAuthStore(s => s.user);

  const allPerms: string[] = (user?.roles ?? []).flatMap(r =>
    Array.isArray(r.role.permissions) ? r.role.permissions : []
  );

  const hasModule = (name: string): boolean => {
    if (!user) return false;
    if (user.isSuperAdmin) return true;
    if (ALWAYS_ON.has(name)) return true;
    // explicit module grant
    if (allPerms.includes(`module.${name}`)) return true;
    if (allPerms.includes('module.*') || allPerms.includes('*')) return true;
    // legacy coarse-permission fallback (roles seeded before module.* existed)
    return (LEGACY[name] ?? []).some(p => allPerms.includes(p));
  };

  return { hasModule, permissions: allPerms };
}

// All modules available for role configuration
export const ALL_MODULES = [
  { key: 'crm',           label: 'CRM',             desc: 'Leads, contacts, companies, pipeline' },
  { key: 'hr',            label: 'HR Management',   desc: 'Employees, attendance, payroll, leave' },
  { key: 'projects',      label: 'Projects',         desc: 'Project tracking and task management' },
  { key: 'finance',       label: 'Finance',          desc: 'Invoices, income, expenses, reports' },
  { key: 'clients',       label: 'Clients',          desc: 'Client management' },
  { key: 'helpdesk',      label: 'Helpdesk',         desc: 'Support tickets and customer service' },
  { key: 'knowledgebase', label: 'Knowledge Base',   desc: 'Articles and internal docs' },
  { key: 'documents',     label: 'Documents',        desc: 'File storage and document management' },
  { key: 'marketing',     label: 'Marketing',        desc: 'Campaigns, social posts, landing pages' },
  { key: 'intelligence',  label: 'AI Intelligence',  desc: 'Business health score and AI insights' },
  { key: 'ai',            label: 'AI Assistant',     desc: 'AI chat and automation' },
  { key: 'workflow',      label: 'Workflows',        desc: 'Automated workflow builder' },
  { key: 'appointments',  label: 'Appointments',     desc: 'Scheduling and bookings' },
  { key: 'whatsapp',      label: 'WhatsApp',         desc: 'WhatsApp messaging integration' },
  { key: 'email',         label: 'Email',            desc: 'Email campaigns and templates' },
  { key: 'analytics',     label: 'Analytics',        desc: 'Reports and data insights' },
  { key: 'messages',      label: 'Messages',         desc: 'Internal team messaging (always on)' },
  { key: 'settings',      label: 'Settings',         desc: 'Company settings and configuration' },
] as const;
