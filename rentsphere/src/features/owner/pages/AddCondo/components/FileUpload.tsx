import React, { useState, useRef, useEffect } from 'react';

interface FileUploadProps {
  onFileSelect: (file: File | null) => void;
}

const FileUpload: React.FC<FileUploadProps> = ({ onFileSelect }) => {
  const [fileName, setFileName] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cleanup object URL on unmount or when preview changes
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files ? event.target.files[0] : null;
    if (file && file.size <= 3 * 1024 * 1024) { // 3 MB limit
      setFileName(file.name);
      // Revoke old URL before creating new one
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      onFileSelect(file);
    } else if (file) {
      alert('File size should not exceed 3 MB.');
      clearFile();
    }
  };

  const clearFile = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setFileName(null);
    setPreviewUrl(null);
    onFileSelect(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleAreaClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        โลโก้คอนโดมิเนียม
      </label>

      {previewUrl ? (
        /* ── Preview State ── */
        <div className="mt-1 border-2 border-blue-400 border-dashed rounded-xl overflow-hidden bg-gradient-to-br from-blue-50/60 to-slate-50/60">
          <div className="flex flex-col sm:flex-row items-center gap-5 p-5">
            {/* Image preview */}
            <div className="relative shrink-0">
              <div className="w-[120px] h-[120px] rounded-xl overflow-hidden ring-2 ring-blue-200 ring-offset-2 shadow-lg bg-white flex items-center justify-center">
                <img
                  src={previewUrl}
                  alt="Logo preview"
                  className="w-full h-full object-contain"
                />
              </div>
            </div>

            {/* File info & actions */}
            <div className="flex-1 text-center sm:text-left space-y-2">
              <p className="text-sm font-semibold text-gray-800 truncate max-w-[260px]">
                {fileName}
              </p>
              <p className="text-xs text-gray-500">
                โลโก้จะแสดงในใบแจ้งหนี้และใบเสร็จ
              </p>
              <div className="flex items-center gap-2 justify-center sm:justify-start pt-1">
                <button
                  type="button"
                  onClick={handleAreaClick}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-100 hover:bg-blue-200 rounded-lg transition cursor-pointer"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" />
                  </svg>
                  เปลี่ยนรูป
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); clearFile(); }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-100 hover:bg-rose-200 rounded-lg transition cursor-pointer"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  ลบ
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ── Empty / Upload State ── */
        <div
          onClick={handleAreaClick}
          className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md cursor-pointer hover:border-blue-500 transition-colors"
        >
          <div className="space-y-1 text-center">
            <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
              <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className="flex text-sm text-gray-600">
              <span className="relative rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none">
                เลือกรูปโลโก้
              </span>
            </div>
            <p className="text-xs text-gray-500">
              รองรับไฟล์รูปภาพ .jpg, .png, .gif ไม่เกิน 3 mb
            </p>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        id="file-upload"
        name="file-upload"
        type="file"
        className="sr-only"
        onChange={handleFileChange}
        accept="image/png, image/jpeg, image/gif"
        title="Select Image of Condominium"
        aria-label="Select Image of Condominium"
      />
    </div>
  );
};

export default FileUpload;
