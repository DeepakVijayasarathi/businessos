'use client';
import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Upload, FolderPlus, Folder, FileText, Download, Trash2, ChevronRight, Search, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { TextField } from '@/components/ui/FormField';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

const FILE_ICONS: Record<string, string> = {
  pdf: '📄', doc: '📝', docx: '📝', xls: '📊', xlsx: '📊', ppt: '📊', pptx: '📊',
  jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', mp4: '🎬', mp3: '🎵', zip: '📦',
};

const getFileIcon = (name: string) => {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  return FILE_ICONS[ext] || '📎';
};

const formatBytes = (bytes: number) => {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

export default function DocumentsPage() {
  const [folderId, setFolderId] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<{ id: string | null; name: string }[]>([{ id: null, name: 'Documents' }]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: folders } = useQuery({
    queryKey: ['folders', folderId],
    queryFn: async () => {
      const params = folderId ? `?parentId=${folderId}` : '';
      const { data } = await api.get(`/documents/folders${params}`);
      return data.data;
    },
  });

  const { data: documents, isLoading } = useQuery({
    queryKey: ['documents', folderId, debouncedSearch],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (folderId) params.set('folderId', folderId);
      if (debouncedSearch) params.set('search', debouncedSearch);
      const { data } = await api.get(`/documents?${params}`);
      return data;
    },
  });

  const uploadMutation = useMutation({
    mutationFn: (files: File[]) => {
      const fd = new FormData();
      files.forEach(f => fd.append('files', f));
      if (folderId) fd.append('folderId', folderId);
      return api.post('/documents/upload-multiple', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['documents'] }); toast.success('Files uploaded'); },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Upload failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/documents/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['documents'] }); toast.success('Deleted'); },
    onError: () => toast.error('Delete failed'),
  });

  const deleteFolderMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/documents/folders/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['folders'] }); toast.success('Folder deleted'); },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Delete failed'),
  });

  const openFolder = (id: string, name: string) => {
    setFolderId(id);
    setBreadcrumbs(prev => [...prev, { id, name }]);
  };

  const navigateTo = (index: number) => {
    const crumb = breadcrumbs[index];
    setFolderId(crumb.id);
    setBreadcrumbs(prev => prev.slice(0, index + 1));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) uploadMutation.mutate(files);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Documents</h1>
          <p className="text-sm text-gray-500 mt-0.5">{documents?.meta?.total || documents?.data?.length || 0} files</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowFolderModal(true)} className="flex items-center gap-2 px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800">
            <FolderPlus className="w-4 h-4" /> New Folder
          </button>
          <button onClick={() => fileRef.current?.click()} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700">
            <Upload className="w-4 h-4" /> Upload
          </button>
          <input ref={fileRef} type="file" multiple className="hidden" onChange={e => { if (e.target.files) uploadMutation.mutate(Array.from(e.target.files)); }} />
        </div>
      </div>

      {/* Breadcrumbs */}
      <div className="flex items-center gap-1 text-sm text-gray-500">
        {breadcrumbs.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="w-3 h-3" />}
            <button onClick={() => navigateTo(i)} className={`hover:text-indigo-600 ${i === breadcrumbs.length - 1 ? 'text-gray-900 dark:text-white font-medium' : ''}`}>{crumb.name}</button>
          </span>
        ))}
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 max-w-sm">
        <Search className="w-4 h-4 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search documents..." className="bg-transparent text-sm text-gray-700 dark:text-gray-200 placeholder-gray-400 outline-none flex-1" />
        {search && <button onClick={() => setSearch('')} aria-label="Clear search"><X className="w-3.5 h-3.5 text-gray-400" /></button>}
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all ${dragging ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-900/20' : 'border-gray-200 dark:border-gray-700'}`}
      >
        <Upload className={`w-8 h-8 mx-auto mb-2 ${dragging ? 'text-indigo-500' : 'text-gray-300'}`} />
        <p className="text-sm text-gray-500">Drag and drop files here, or <button onClick={() => fileRef.current?.click()} className="text-indigo-600 font-medium">browse</button></p>
        {uploadMutation.isPending && <p className="text-xs text-indigo-500 mt-1">Uploading...</p>}
      </div>

      {/* Folders */}
      {folders && folders.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Folders</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {folders.map((folder: any) => (
              <div
                key={folder.id}
                role="button"
                tabIndex={0}
                onClick={() => openFolder(folder.id, folder.name)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openFolder(folder.id, folder.name); } }}
                className="glass-card rounded-xl p-4 cursor-pointer hover:shadow-md transition-all group relative focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                <Folder className="w-8 h-8 text-yellow-400 mb-2" />
                <p className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{folder.name}</p>
                <p className="text-xs text-gray-400">{folder._count?.documents || 0} files</p>
                <button onClick={e => { e.stopPropagation(); if (confirm(`Delete folder "${folder.name}"? It must be empty first.`)) deleteFolderMutation.mutate(folder.id); }} className="absolute top-2 right-2 p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Files */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Files</h2>
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-gray-100 dark:border-gray-800">
              <tr>
                {['Name', 'Size', 'Uploaded', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}><td colSpan={4} className="px-4 py-3"><div className="h-5 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" /></td></tr>
                ))
              ) : documents?.data?.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-10 text-center text-gray-400 text-sm">No files in this folder</td></tr>
              ) : documents?.data?.map((doc: any) => (
                <tr key={doc.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{getFileIcon(doc.name)}</span>
                      <span className="text-sm text-gray-900 dark:text-white font-medium truncate max-w-64">{doc.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{formatBytes(doc.size)}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">{formatDate(doc.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <a href={`${API_URL}/api/v1/documents/${doc.id}/download`} target="_blank" rel="noopener noreferrer" className="p-1.5 text-gray-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20"><Download className="w-4 h-4" /></a>
                      <button onClick={() => { if (confirm('Delete this file?')) deleteMutation.mutate(doc.id); }} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      </div>

      {showFolderModal && <FolderModal parentId={folderId} onClose={() => setShowFolderModal(false)} />}
    </div>
  );
}

function FolderModal({ parentId, onClose }: { parentId: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/documents/folders', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['folders'] }); toast.success('Folder created'); onClose(); },
    onError: () => toast.error('Failed to create folder'),
  });
  return (
    <Modal onClose={onClose} title="New Folder" subtitle="Create a folder to organize your documents" icon={Folder} iconColor="yellow" size="sm">
      <form onSubmit={e => { e.preventDefault(); mutation.mutate({ name, parentId }); }}>
        <div className="p-6 space-y-4">
          <TextField id="folder-name" label="Folder name" required value={name} onChange={e => setName(e.target.value)} placeholder="Folder name" />
        </div>
        <ModalFooter>
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300">Cancel</button>
          <button type="submit" disabled={mutation.isPending} className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium disabled:opacity-50">{mutation.isPending ? 'Creating...' : 'Create'}</button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
