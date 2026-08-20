import { useRef, useState, useEffect } from 'react';
import { Upload, FileText, X, AlertCircle } from 'lucide-react';
import { requestUploadUrl, uploadToS3 } from '../../services/api';
import * as pdfjsLib from 'pdfjs-dist';
import { useTheme } from '../../hooks/useTheme';

// Configure PDF.js worker - use CDN for production compatibility
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

interface Props {
  file: File | null;
  onFileChange: (file: File | null) => void;
  onS3KeyChange: (s3Key: string) => void;
  storedPageCount?: number | null;
  storedFileSize?: number | null;
  onPageCountChange?: (count: number | null) => void;
  onFileSizeChange?: (size: number | null) => void;
}

export default function UploadStep({ file, onFileChange, onS3KeyChange, storedPageCount, storedFileSize, onPageCountChange, onFileSizeChange }: Props) {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pageCount, setPageCount] = useState<number | null>(storedPageCount ?? null);

  async function handleFile(f: File) {
    if (f.type !== 'application/pdf') {
      setError('Only PDF files are supported.');
      return;
    }
    const headerBuffer = await f.slice(0, 5).arrayBuffer();
    const header = new TextDecoder().decode(headerBuffer);
    if (!header.startsWith('%PDF-')) {
      setError('Only PDF files are supported.');
      return;
    }
    if (f.size > 25 * 1024 * 1024) {
      setError('File exceeds the 25 MB limit.');
      return;
    }
    setError(null);
    setUploading(true);

    try {
      const { upload_url, s3_key } = await requestUploadUrl(f.name);
      await uploadToS3(upload_url, f);
      onFileChange(f);
      onS3KeyChange(s3_key);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed. Please try again.';
      setError(message);
      onFileChange(null);
    } finally {
      setUploading(false);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    e.target.value = '';
  }

  useEffect(() => {
    if (!file) {
      setPageCount(null);
      return;
    }

    // If we have stored values and file is a mock (size 0), use stored values
    if (file.size === 0 && storedPageCount) {
      setPageCount(storedPageCount);
      return;
    }

    const loadPageCount = async () => {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        setPageCount(pdf.numPages);
        onPageCountChange?.(pdf.numPages);
        onFileSizeChange?.(file.size);
      } catch (err) {
        console.error('Failed to read PDF page count:', err);
        setPageCount(null);
      }
    };

    loadPageCount();
  }, [file, storedPageCount, onPageCountChange, onFileSizeChange]);

  return (
    <div className="space-y-4">
      {!file ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => !uploading && inputRef.current?.click()}
          className={`
            border-2 border-dashed rounded-xl p-10 flex flex-col items-center gap-4 transition-all duration-200
            ${uploading ? 'opacity-60 cursor-wait' : 'cursor-pointer'}
            ${dragging ? (isLight ? 'border-amber-500 bg-amber-500/5' : 'border-amber-400 bg-amber-400/5') : (isLight ? 'border-zinc-400 hover:border-zinc-500 hover:bg-zinc-200/50' : 'border-zinc-600 hover:border-zinc-500 hover:bg-zinc-900/50')}
          `}
        >
          <div className={`p-4 rounded-full ${dragging ? (isLight ? 'bg-amber-500/10' : 'bg-amber-400/10') : (isLight ? 'bg-zinc-300' : 'bg-zinc-700')}`}>
            <Upload size={28} className={dragging ? (isLight ? 'text-amber-600' : 'text-amber-400') : (isLight ? 'text-zinc-600' : 'text-zinc-300')} />
          </div>
          <div className="text-center">
            <p className={`font-medium ${isLight ? 'text-zinc-800' : 'text-zinc-100'}`}>
              {uploading ? 'Uploading...' : 'Drop your PDF here or browse'}
            </p>
            <p className={`text-sm mt-1 ${isLight ? 'text-zinc-500' : 'text-zinc-500'}`}>PDF, up to 25 MB</p>
          </div>
          <button
            type="button"
            disabled={uploading}
            className={`px-4 py-2 rounded-lg border text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${isLight ? 'border-zinc-400 text-zinc-700 hover:border-zinc-500 hover:text-zinc-900' : 'border-zinc-600 text-zinc-200 hover:border-zinc-400 hover:text-white'}`}
          >
            {uploading ? 'Uploading...' : 'Browse files'}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={onInputChange}
          />
        </div>
      ) : (
        <div className={`flex items-center gap-3 rounded-xl px-4 py-4 border-3 ${isLight ? 'bg-zinc-200 border-zinc-400' : 'bg-zinc-800 border-zinc-600'}`}>
          <div className={`p-2 rounded-lg ${isLight ? 'bg-amber-500/10' : 'bg-amber-400/10'}`}>
            <FileText size={20} className={isLight ? 'text-amber-600' : 'text-amber-400'} />
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-medium truncate ${isLight ? 'text-zinc-800' : 'text-zinc-100'}`}>{file.name}</p>
            <p className={`text-xs mt-0.5 ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
              {pageCount ? `${pageCount} pages` : 'Loading...'} · {((file.size > 0 ? file.size : storedFileSize ?? 0) / 1024 / 1024).toFixed(1)} MB
            </p>
          </div>
          <button
            type="button"
            onClick={() => { onFileChange(null); setError(null); }}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${isLight ? 'hover:bg-zinc-300 text-zinc-500 hover:text-zinc-700' : 'hover:bg-zinc-700 text-zinc-500 hover:text-zinc-200'}`}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-red-500 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          <AlertCircle size={15} />
          {error}
        </div>
      )}
    </div>
  );
}
