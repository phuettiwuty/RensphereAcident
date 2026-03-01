import React, { useState } from 'react';
import { PROFILE_TEXT } from '../constants/profileText';
import { updateProfileData } from '../services/profile.service';
import type { UserProfile } from '../types/profile.type';

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile?: UserProfile | null;
  onSaved?: () => void;
}

const EditProfileModal: React.FC<EditProfileModalProps> = ({ isOpen, onClose, profile, onSaved }) => {
  const [name, setName] = useState(profile?.name || "");
  const [phone, setPhone] = useState(profile?.phone || "");
  const [email, setEmail] = useState(profile?.email || "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  // sync when profile changes
  React.useEffect(() => {
    if (profile) {
      setName(profile.name || "");
      setPhone(profile.phone === "—" ? "" : profile.phone || "");
      setEmail(profile.email === "—" ? "" : profile.email || "");
    }
  }, [profile]);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!name.trim()) { setErr("กรุณากรอกชื่อ"); return; }
    setSaving(true);
    setErr("");
    try {
      await updateProfileData({ name: name.trim(), phone: phone.trim(), email: email.trim() });
      onSaved?.();
      onClose();
    } catch (e: any) {
      setErr(e?.message || "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-6 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-md rounded-t-[2.5rem] sm:rounded-[2.5rem] p-8 shadow-2xl animate-in slide-in-from-bottom-full sm:slide-in-from-bottom-0 duration-300 max-h-[90vh] overflow-y-auto">
        <h3 className="text-2xl font-bold text-gray-800 mb-6">{PROFILE_TEXT.EDIT_PROFILE}</h3>

        {err && (
          <div className="mb-4 rounded-2xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm font-bold text-rose-700">
            {err}
          </div>
        )}

        <div className="space-y-4 mb-8">
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{PROFILE_TEXT.LABEL_NAME}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full p-4 bg-gray-50 rounded-2xl border border-gray-100 focus:border-blue-300 outline-none font-medium text-gray-700"
              placeholder="กรอกชื่อ-นามสกุลของคุณ"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{PROFILE_TEXT.LABEL_PHONE}</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full p-4 bg-gray-50 rounded-2xl border border-gray-100 focus:border-blue-300 outline-none font-medium text-gray-700"
              placeholder="กรอกเบอร์โทรศัพท์"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{PROFILE_TEXT.LABEL_EMAIL}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-4 bg-gray-50 rounded-2xl border border-gray-100 focus:border-blue-300 outline-none font-medium text-gray-700"
              placeholder="กรอกอีเมล"
            />
          </div>
        </div>

        <div className="flex gap-4">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 py-4 bg-gray-100 text-gray-500 font-bold rounded-2xl active:scale-95 transition-all"
          >
            {PROFILE_TEXT.CANCEL}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-[2] py-4 bg-blue-600 text-white font-bold rounded-2xl shadow-lg shadow-blue-100 active:scale-95 transition-all px-8 disabled:opacity-60"
          >
            {saving ? "กำลังบันทึก..." : PROFILE_TEXT.SAVE}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditProfileModal;
