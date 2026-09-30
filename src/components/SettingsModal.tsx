import React, { useEffect, useRef, useState } from 'react';
import { X, Camera, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { useUpdateProfile, useUploadImages } from '../hooks/useQueries';
import { notifyError } from '../stores/useToasts';
import { friendlyError } from '../lib/errors';
import type { UserProfile } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  user: UserProfile | null;
  onClose: () => void;
  theme: 'dark' | 'light';
}

/** Mirrors `profileUpdateSchema` in backend/src/schemas.ts, so an invalid value
 * becomes a message next to the field instead of a 400. */
const USERNAME_RE = /^[a-zA-Z0-9_.-]+$/;
const MAX_BIO = 500;
const MAX_AREA = 120;

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, user, onClose, theme }) => {
  const [username, setUsername] = useState('');
  const [area, setArea] = useState('');
  const [bio, setBio] = useState('');
  const [avatar, setAvatar] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { mutate: updateProfile, isPending } = useUpdateProfile();
  const { mutateAsync: uploadImages, isPending: isUploading } = useUploadImages();

  // Re-seed on every open so a saved value is not offered for change again.
  useEffect(() => {
    if (!isOpen || !user) return;
    setUsername(user.name === 'Unknown neighbor' ? '' : user.name);
    setArea(user.neighborhood ?? '');
    setBio(user.bio ?? '');
    setAvatar(user.avatar ?? '');
    setError('');
    setSaved(false);
  }, [isOpen, user]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !user) return null;

  const handleAvatarPick = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    try {
      const res = await uploadImages([file]);
      const url = res.images?.[0]?.url;
      if (!url) throw new Error('Upload returned no image');
      setAvatar(url);
    } catch (err) {
      notifyError(err, 'We could not upload that photo.');
      setError(friendlyError(err, 'We could not upload that photo.'));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const nextName = username.trim();
    if (nextName.length < 3 || nextName.length > 30) {
      setError('Username must be between 3 and 30 characters.');
      return;
    }
    if (!USERNAME_RE.test(nextName)) {
      setError('Usernames can only use letters, numbers, and _ . -');
      return;
    }
    if (bio.length > MAX_BIO) {
      setError(`Bio must be ${MAX_BIO} characters or fewer.`);
      return;
    }
    if (area.trim().length > MAX_AREA) {
      setError(`Area must be ${MAX_AREA} characters or fewer.`);
      return;
    }

    // Send only what changed; the server schema is strict.
    const patch: {
      username?: string;
      bio?: string;
      location?: string;
      avatar_url?: string;
    } = {};
    if (nextName !== user.name) patch.username = nextName;
    if (bio.trim() !== (user.bio ?? '')) patch.bio = bio.trim();
    if (area.trim() !== (user.neighborhood ?? '')) patch.location = area.trim();
    if (avatar && avatar !== user.avatar) patch.avatar_url = avatar;

    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }

    updateProfile(patch, {
      onSuccess: () => setSaved(true),
      onError: (err) => {
        setError(friendlyError(err, 'We could not save your changes.'));
        notifyError(err, 'We could not save your changes.');
      },
    });
  };

  const busy = isPending || isUploading;

  return (
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-end sm:items-center justify-center sm:p-4 bg-ink/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md max-h-[94vh] sm:max-h-[90vh] bg-card border border-line rounded-t-3xl sm:rounded-2xl overflow-hidden flex flex-col animate-scale-in"
        data-theme={theme}
      >
        <div className="px-5 py-4 border-b border-line flex items-center justify-between gap-4">
          <div>
            <h2 id="settings-modal-title" className="font-display text-xl font-bold text-ink">
              Account settings
            </h2>
            <p className="text-sm text-ink-soft mt-0.5">Update how neighbors see you.</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 rounded-full grid place-items-center hover:bg-sand transition-colors touch-manipulation focus-ring"
          >
            <X className="w-5 h-5 text-ink" aria-hidden="true" />
          </button>
        </div>

        {saved ? (
          <div className="p-6 text-center animate-fade-in">
            <div className="w-16 h-16 mx-auto rounded-full bg-moss grid place-items-center mb-4">
              <CheckCircle2 className="w-8 h-8 text-white" aria-hidden="true" />
            </div>
            <h3 className="font-display text-xl font-bold text-ink">Profile saved</h3>
            <p className="mt-1 text-sm text-ink-soft">Your changes are visible to other members now.</p>
            <button
              onClick={onClose}
              className="mt-5 w-full h-11 rounded-full bg-clay hover:bg-clay-hover text-white font-semibold text-sm transition-colors touch-manipulation focus-ring"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="overflow-y-auto no-scrollbar flex-1 p-5 sm:p-6 space-y-5" noValidate>
            <div className="flex items-center gap-4">
              <div className="relative shrink-0">
                {avatar ? (
                  <img src={avatar} alt="" className="w-20 h-20 rounded-full object-cover ring-2 ring-line" />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-sand grid place-items-center font-display text-2xl font-bold text-ink-soft ring-2 ring-line" aria-hidden="true">
                    {(username || '?').charAt(0).toUpperCase()}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={isUploading}
                  aria-label="Change profile photo"
                  className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full bg-clay text-white grid place-items-center ring-4 ring-card hover:bg-clay-hover transition-colors touch-manipulation focus-ring disabled:opacity-60"
                >
                  {isUploading ? (
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Camera className="w-4 h-4" aria-hidden="true" />
                  )}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => { void handleAvatarPick(e.target.files?.[0]); e.target.value = ''; }}
                />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">Profile photo</p>
                <p className="text-xs text-ink-soft mt-0.5">Shown on your listings and in chat.</p>
              </div>
            </div>

            <label className="block">
              <span className="text-xs font-semibold text-ink-soft">Username</span>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                maxLength={30}
                autoComplete="username"
                className="mt-1.5 w-full h-11 px-3.5 rounded-lg border border-line bg-paper text-sm text-ink placeholder:text-ink-soft/60 focus:outline-none focus:border-ink focus:ring-2 focus:ring-clay/20 transition-smooth"
              />
              <span className="mt-1 block text-xs text-ink-muted">
                3-30 characters. Letters, numbers, and _ . -
              </span>
            </label>

            <label className="block">
              <span className="text-xs font-semibold text-ink-soft">Area</span>
              <input
                type="text"
                value={area}
                onChange={(e) => setArea(e.target.value)}
                maxLength={MAX_AREA}
                placeholder="Baguio City, Benguet"
                className="mt-1.5 w-full h-11 px-3.5 rounded-lg border border-line bg-paper text-sm text-ink placeholder:text-ink-soft/60 focus:outline-none focus:border-ink focus:ring-2 focus:ring-clay/20 transition-smooth"
              />
              <span className="mt-1 block text-xs text-ink-muted">
                A label for your area. Move your map pin from the navbar.
              </span>
            </label>

            <label className="block">
              <span className="text-xs font-semibold text-ink-soft">About you (optional)</span>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={4}
                maxLength={MAX_BIO}
                placeholder="Tell neighbors a little about yourself."
                className="mt-1.5 w-full px-3.5 py-3 rounded-lg border border-line bg-paper text-sm text-ink placeholder:text-ink-soft/60 focus:outline-none focus:border-ink focus:ring-2 focus:ring-clay/20 resize-none transition-smooth"
              />
              <span className="mt-1 block text-xs text-ink-muted text-right">
                {bio.length}/{MAX_BIO}
              </span>
            </label>

            {error && (
              <p role="alert" className="text-sm text-red-600 flex items-start gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                {error}
              </p>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 h-12 rounded-full border border-line text-ink font-semibold text-sm hover:bg-sand transition-colors touch-manipulation focus-ring"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="flex-1 h-12 rounded-full bg-clay hover:bg-clay-hover disabled:bg-line disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors touch-manipulation focus-ring active:scale-[0.98] flex items-center justify-center gap-2"
              >
                {isPending && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                {isPending ? 'Saving\u2026' : 'Save changes'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
