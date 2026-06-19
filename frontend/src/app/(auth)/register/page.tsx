'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import api, { setAccessToken } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Zap, CheckCircle2 } from 'lucide-react';

export default function RegisterPage() {
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '', companyName: '' });
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const features = ['14-day free trial', 'All modules included', 'No credit card required', 'Cancel anytime'];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post('/auth/register', form);
      setAccessToken(data.data.accessToken);
      useAuthStore.setState({ user: data.data.user, isAuthenticated: true });
      toast.success('Account created! Welcome aboard!');
      router.push('/dashboard');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl grid md:grid-cols-2 gap-12 items-center">
        {/* Left */}
        <div className="hidden md:block">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center mb-6 shadow-lg">
            <Zap className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">
            All-in-one business platform
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mb-8">
            Replace 10+ tools with one AI-powered platform. CRM, HR, Finance, Projects, and more.
          </p>
          <ul className="space-y-3">
            {features.map(f => (
              <li key={f} className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-300">
                <CheckCircle2 className="w-5 h-5 text-indigo-600 flex-shrink-0" />
                {f}
              </li>
            ))}
          </ul>
        </div>

        {/* Right */}
        <div>
          <div className="text-center md:text-left mb-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Create your account</h2>
            <p className="text-sm text-gray-500 mt-1">Start your 14-day free trial today</p>
          </div>

          <div className="glass-card rounded-2xl p-8 shadow-xl">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {[
                  { field: 'firstName', label: 'First Name', placeholder: 'John' },
                  { field: 'lastName', label: 'Last Name', placeholder: 'Smith' },
                ].map(({ field, label, placeholder }) => (
                  <div key={field}>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
                    <input
                      value={form[field as keyof typeof form]}
                      onChange={e => setForm({ ...form, [field]: e.target.value })}
                      placeholder={placeholder}
                      required
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                    />
                  </div>
                ))}
              </div>

              {[
                { field: 'companyName', label: 'Company Name', placeholder: 'Acme Inc.', type: 'text' },
                { field: 'email', label: 'Work Email', placeholder: 'you@company.com', type: 'email' },
                { field: 'password', label: 'Password', placeholder: 'Min 8 characters', type: 'password' },
              ].map(({ field, label, placeholder, type }) => (
                <div key={field}>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
                  <input
                    type={type}
                    value={form[field as keyof typeof form]}
                    onChange={e => setForm({ ...form, [field]: e.target.value })}
                    placeholder={placeholder}
                    required
                    minLength={field === 'password' ? 8 : undefined}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  />
                </div>
              ))}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-xl hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm shadow-lg shadow-indigo-500/25 mt-2"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Creating account...
                  </span>
                ) : 'Start free trial'}
              </button>
            </form>

            <p className="text-center text-xs text-gray-500 mt-4">
              Already have an account?{' '}
              <Link href="/login" className="text-indigo-600 dark:text-indigo-400 font-medium hover:underline">Sign in</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
