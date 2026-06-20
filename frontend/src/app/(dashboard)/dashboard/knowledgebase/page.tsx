'use client';
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Plus, Search, BookOpen, Eye, ThumbsUp, ThumbsDown, ChevronRight, X, Edit, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function KnowledgeBasePage() {
  const [categoryId, setCategoryId] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedArticle, setSelectedArticle] = useState<any>(null);
  const [showModal, setShowModal] = useState(false);
  const [editArticle, setEditArticle] = useState<any>(null);
  const qc = useQueryClient();

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: categories } = useQuery({
    queryKey: ['kb-categories'],
    queryFn: async () => { const { data } = await api.get('/knowledgebase/categories'); return data.data; },
  });

  const { data: articles, isLoading } = useQuery({
    queryKey: ['kb-articles', categoryId, debouncedSearch],
    queryFn: async () => {
      const params = new URLSearchParams({ status: 'published' });
      if (categoryId) params.set('categoryId', categoryId);
      if (debouncedSearch) params.set('search', debouncedSearch);
      const { data } = await api.get(`/knowledgebase/articles?${params}`);
      return data;
    },
  });

  const feedbackMutation = useMutation({
    mutationFn: ({ id, type }: any) => api.post(`/knowledgebase/articles/${id}/feedback`, { type }),
    onSuccess: () => toast.success('Thanks for your feedback!'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/knowledgebase/articles/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['kb-articles'] }); toast.success('Article deleted'); setSelectedArticle(null); },
    onError: () => toast.error('Delete failed'),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Knowledge Base</h1>
          <p className="text-sm text-gray-500 mt-0.5">{articles?.meta?.total || articles?.data?.length || 0} articles</p>
        </div>
        <button onClick={() => { setEditArticle(null); setShowModal(true); }} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700">
          <Plus className="w-4 h-4" /> New Article
        </button>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 max-w-xl">
        <Search className="w-4 h-4 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search articles..." className="bg-transparent text-sm text-gray-700 dark:text-gray-200 placeholder-gray-400 outline-none flex-1" />
        {search && <button onClick={() => setSearch('')} aria-label="Clear search"><X className="w-4 h-4 text-gray-400" /></button>}
      </div>

      <div className="grid lg:grid-cols-4 gap-6">
        {/* Category sidebar */}
        <div className="lg:col-span-1 space-y-1">
          <button onClick={() => setCategoryId('')} className={`w-full text-left px-3 py-2 rounded-xl text-sm font-medium transition-all ${!categoryId ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
            All Categories
          </button>
          {categories?.map((cat: any) => (
            <button key={cat.id} onClick={() => setCategoryId(cat.id)} className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-all flex items-center justify-between ${categoryId === cat.id ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-medium' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
              <span>{cat.icon && <span className="mr-1.5">{cat.icon}</span>}{cat.name}</span>
              <span className="text-xs text-gray-400">{cat._count?.articles}</span>
            </button>
          ))}
        </div>

        {/* Articles */}
        <div className="lg:col-span-3">
          {selectedArticle ? (
            <ArticleView article={selectedArticle} onBack={() => setSelectedArticle(null)} onFeedback={feedbackMutation.mutate} onEdit={() => { setEditArticle(selectedArticle); setShowModal(true); }} onDelete={() => { if (confirm('Delete this article?')) deleteMutation.mutate(selectedArticle.id); }} />
          ) : (
            <div className="space-y-3">
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 glass-card rounded-2xl animate-pulse" />)
              ) : articles?.data?.length === 0 ? (
                <div className="glass-card rounded-2xl p-12 text-center text-gray-400">
                  <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>No articles found</p>
                </div>
              ) : articles?.data?.map((article: any) => (
                <div key={article.id} className="glass-card rounded-2xl p-5 cursor-pointer hover:shadow-md transition-all" onClick={() => setSelectedArticle(article)}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1 group-hover:text-indigo-600">{article.title}</h3>
                      {article.excerpt && <p className="text-xs text-gray-500 line-clamp-2">{article.excerpt}</p>}
                      <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                        {article.category && <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded-full">{article.category.name}</span>}
                        <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{article.views}</span>
                        <span className="flex items-center gap-1"><ThumbsUp className="w-3 h-3" />{article.helpful}</span>
                        <span>{formatDate(article.updatedAt)}</span>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-400 ml-3 flex-shrink-0" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showModal && <ArticleModal article={editArticle} categories={categories || []} onClose={() => setShowModal(false)} />}
    </div>
  );
}

function ArticleView({ article, onBack, onFeedback, onEdit, onDelete }: any) {
  return (
    <div className="glass-card rounded-2xl">
      <div className="p-6 border-b border-gray-100 dark:border-gray-800">
        <button onClick={onBack} className="flex items-center gap-1 text-xs text-indigo-600 mb-3 hover:underline"><ChevronRight className="w-3 h-3 rotate-180" /> Back</button>
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">{article.title}</h2>
          <div className="flex gap-2 ml-4">
            <button onClick={onEdit} className="p-1.5 text-gray-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20"><Edit className="w-4 h-4" /></button>
            <button onClick={onDelete} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
          {article.category && <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded-full">{article.category.name}</span>}
          <span><Eye className="w-3 h-3 inline mr-1" />{article.views} views</span>
        </div>
      </div>
      <div className="p-6">
        <div className="prose prose-sm dark:prose-invert max-w-none text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">{article.content}</div>
      </div>
      <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex items-center gap-4">
        <p className="text-sm text-gray-500 mr-2">Was this helpful?</p>
        <button onClick={() => onFeedback({ id: article.id, type: 'helpful' })} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 font-medium">
          <ThumbsUp className="w-4 h-4" /> Yes ({article.helpful})
        </button>
        <button onClick={() => onFeedback({ id: article.id, type: 'notHelpful' })} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 font-medium">
          <ThumbsDown className="w-4 h-4" /> No ({article.notHelpful})
        </button>
      </div>
    </div>
  );
}

function ArticleModal({ article, categories, onClose }: { article: any; categories: any[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    title: article?.title || '',
    content: article?.content || '',
    excerpt: article?.excerpt || '',
    categoryId: article?.categoryId || categories[0]?.id || '',
    status: article?.status || 'draft',
    tags: article?.tags?.join(', ') || '',
  });

  const mutation = useMutation({
    mutationFn: (data: any) => {
      const payload = { ...data, tags: data.tags ? data.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [] };
      return article ? api.put(`/knowledgebase/articles/${article.id}`, payload) : api.post('/knowledgebase/articles', payload);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['kb-articles'] }); toast.success(article ? 'Article updated!' : 'Article created!'); onClose(); },
    onError: () => toast.error('Failed to save article'),
  });

  const inputCls = "w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500";

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="glass-card rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white">{article ? 'Edit' : 'New'} Article</h3>
          <button onClick={onClose} className="text-gray-400">✕</button>
        </div>
        <form onSubmit={e => { e.preventDefault(); mutation.mutate(form); }} className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <div><label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Title*</label><input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className={inputCls} /></div>
            <div><label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Excerpt</label><input value={form.excerpt} onChange={e => setForm({ ...form, excerpt: e.target.value })} className={inputCls} /></div>
            <div><label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Content*</label><textarea required rows={10} value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} className={inputCls + ' resize-none font-mono text-xs'} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Category</label>
                <select value={form.categoryId} onChange={e => setForm({ ...form, categoryId: e.target.value })} className={inputCls}>
                  <option value="">No category</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div><label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
                <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className={inputCls}>
                  {['draft', 'published', 'archived'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div><label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Tags (comma separated)</label><input value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} className={inputCls} placeholder="setup, billing, account" /></div>
          </div>
          <div className="flex gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300">Cancel</button>
            <button type="submit" disabled={mutation.isPending} className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium disabled:opacity-50">{mutation.isPending ? 'Saving...' : 'Save Article'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
