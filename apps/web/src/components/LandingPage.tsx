import React, { useState } from 'react';
import { MapPin, Zap, Lock, Mail, User, CheckCircle2, Activity, Crosshair } from 'lucide-react';
import { useLogin, useSignup } from '../hooks/useQueries';
import { fieldErrors, friendlyError } from '../lib/errors';
import { isInPhilippines, describeArea, type LatLng } from '../lib/geo';
import { LocationPickerModal } from './LocationPickerModal';
import { APP_VERSION } from '../version';

interface LandingPageProps {
  /** Called after a successful sign-in so the caller can re-read the session. */
  onAuthenticated: () => void;
  theme: 'dark' | 'light';
}

/** 16px minimum — iOS Safari zooms any focused control under 16px. */
const inputCls =
  'w-full h-12 pl-10 pr-4 rounded-xl border border-line bg-card text-[16px] leading-normal text-ink placeholder:text-ink-soft/60 focus:outline-none focus:border-ink focus:ring-2 focus:ring-clay/20 transition-smooth touch-manipulation';

/** Adds a red border to whichever field the server (or the local check) rejected. */
const inputErrCls = 'border-rose focus:border-rose focus:ring-rose/20';

/** Inline message under a field, tied to it for screen readers. */
const FieldError: React.FC<{ id: string; message?: string }> = ({ id, message }) =>
  message ? (
    <p id={id} className="mt-1 text-xs font-medium text-rose flex items-center gap-1">
      <AlertCircle className="w-3 h-3 shrink-0" aria-hidden="true" />
      {message}
    </p>
  ) : null;

const FEATURES = [
  { Icon: MapPin, title: 'Neighborhood listings', text: 'Browse what is actually for sale around you, posted by real neighbors.' },
  { Icon: Zap, title: 'Post in seconds', text: 'Add a photo, name a price, and your item is live straight away.' },
  { Icon: Lock, title: 'Your account stays yours', text: 'Sign up with an email and password. We never sell your data.' },
];

const TRUST_SIGNALS = [
  { Icon: CheckCircle2, text: 'No sign-up fees' },
  { Icon: Lock, text: 'Passwords hashed by Supabase Auth' },
  { Icon: Zap, text: 'Live listings, no waiting' },
];

export const LandingPage: React.FC<LandingPageProps> = ({ onAuthenticated, theme }) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  // The pin stands in for a typed city: it is what makes "near me" answerable.
  const [location, setLocation] = useState<LatLng | null>(null);
  const [locationLabel, setLocationLabel] = useState('');
  const [isLocationOpen, setIsLocationOpen] = useState(false);
  const [formError, setFormError] = useState('');
  const [fieldErrs, setFieldErrs] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');

  const { mutate: login, isPending: isLoggingIn } = useLogin();
  const { mutate: signup, isPending: isSigningUp } = useSignup();
  const submitting = isLoggingIn || isSigningUp;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFieldErrs({});
    setNotice('');

    if (!email || !password || (isSignUp && !name)) {
      setFormError('Please fill in all required fields.');
      return;
    }

    // The pin is required; open the map rather than only complaining about it,
    // since the field lives in a popup.
    if (isSignUp && !location) {
      setFieldErrs({ location: 'Choose your location on the map so we know what is near you.' });
      setIsLocationOpen(true);
      return;
    }
    if (isSignUp && location && !isInPhilippines(location)) {
      setFieldErrs({ location: 'That point is outside the Philippines. Please pick a spot inside the country.' });
      return;
    }

    // Catch obvious cases before spending a request, using the server's wording.
    if (isSignUp && password.length < 8) {
      setFieldErrs({ password: 'Your password needs at least 8 characters.' });
      return;
    }
    if (isSignUp && !/^[a-zA-Z0-9_.-]{3,30}$/.test(name.trim())) {
      setFieldErrs({ name: 'Use 3 to 30 letters, numbers, dots, dashes or underscores.' });
      return;
    }

    const onFail = (err: unknown, fallback: string) => {
      const perField = fieldErrors(err);
      if (Object.keys(perField).length) setFieldErrs(perField);
      setFormError(friendlyError(err, fallback));
    };

    if (isSignUp && location) {
      signup(
        {
          email: email.trim(),
          password,
          username: name.trim(),
          lat: location.lat,
          lng: location.lng,
          location: locationLabel.trim() || undefined,
        },
        {
          onSuccess: (data) => {
            if (data?.session) {
              onAuthenticated();
              return;
            }
            setNotice(
              data?.message ||
                'Account created. Check your email to verify your account, then sign in.',
            );
          },
          onError: (err) => onFail(err, 'We could not create your account.'),
        },
      );
      return;
    }

    login(
      { email: email.trim(), password },
      {
        onSuccess: () => onAuthenticated(),
        onError: (err) => onFail(err, 'We could not sign you in.'),
      },
    );
  };

  const switchMode = () => {
    setIsSignUp((prev) => !prev);
    setFormError('');
    setNotice('');
  };

  return (
    <div className="app-height overflow-y-auto overscroll-none flex flex-col bg-paper text-ink">
      {/* safe-top is OUTSIDE the bar height — nesting it inside h-14 crushed the logo under the notch. */}
      <header className="w-full shrink-0 bg-paper border-b border-line safe-top">
        <div className="w-full px-4 sm:px-8 h-14 sm:h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <span className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-clay grid place-items-center shadow-[2px_2px_0_var(--color-ink)] shrink-0">
              <Activity className="w-5 h-5 sm:w-6 sm:h-6 text-white" aria-hidden="true" strokeWidth={2.5} />
            </span>
            <span className="leading-none min-w-0">
              <span className="block font-display text-xl sm:text-2xl font-bold text-ink tracking-tight truncate">
                Pulse Market
              </span>
              <span className="hidden sm:block mt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-soft">
                Neighborhood marketplace
              </span>
            </span>
          </div>
          <span className="hidden md:flex items-center gap-1.5 text-xs font-semibold text-ink-soft shrink-0">
            <MapPin className="w-3.5 h-3.5 text-clay" aria-hidden="true" />
            Buy and sell within walking distance
          </span>
        </div>
      </header>

      <main className="flex-1 w-full max-w-6xl mx-auto lg:px-8 lg:py-10 grid grid-cols-1 lg:grid-cols-12 lg:gap-10 lg:items-center">
        <section className="hidden lg:block lg:col-span-7 min-w-0 animate-rise px-0" style={{ animationDelay: '0ms' }}>
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-clay mb-3">The neighborhood yard sale, every day</p>
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.05] text-balance">
            Good stuff is <em className="not-italic text-clay">already</em> on your street.
          </h1>
          <p className="mt-4 text-base leading-relaxed max-w-xl text-ink-soft">
            Find furniture, gear and free giveaways from people a few blocks away. Meet, hand over, done.
          </p>

          <dl className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-6 border-t border-line pt-6">
            {FEATURES.map(({ Icon, title, text }, index) => (
              <div key={title} className="animate-rise" style={{ animationDelay: `${150 + index * 80}ms` }}>
                <div className="w-10 h-10 rounded-xl bg-moss-light grid place-items-center mb-3">
                  <Icon className="w-5 h-5 text-moss" aria-hidden="true" />
                </div>
                <dt className="font-semibold text-sm text-ink">{title}</dt>
                <dd className="mt-1 text-sm leading-relaxed text-ink-soft">{text}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-8 flex flex-wrap gap-2 animate-rise" style={{ animationDelay: '400ms' }}>
            {TRUST_SIGNALS.map(({ Icon, text }, index) => (
              <span key={text} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card border border-line text-xs font-medium text-ink-soft animate-rise" style={{ animationDelay: `${500 + index * 60}ms` }}>
                <Icon className="w-3.5 h-3.5 text-moss" aria-hidden="true" />
                {text}
              </span>
            ))}
          </div>
        </section>

        {/* Mobile: full-bleed auth scene. Desktop: card in the right column.
            No animate-rise here — a lingering transform on the form parent can
            make iOS mis-measure input font size and zoom on focus. */}
        <section className="lg:col-span-5 w-full flex flex-col min-h-0">
          <div className="flex-1 flex flex-col w-full max-w-none lg:max-w-md mx-auto lg:mx-0 bg-transparent lg:bg-card lg:border lg:border-line lg:rounded-2xl px-5 pt-6 pb-4 sm:px-8 sm:pt-8 lg:p-7 lg:shadow-[6px_6px_0_var(--color-line)] relative lg:overflow-hidden">
            <div className="hidden lg:block absolute inset-0 bg-gradient-to-br from-clay/5 via-transparent to-moss/5" aria-hidden="true" />

            <div className="relative z-10 flex-1 flex flex-col">
              {/* Short mobile brand line — desktop keeps the big left column. */}
              <p className="lg:hidden text-xs font-bold uppercase tracking-[0.14em] text-clay mb-2">
                Neighborhood marketplace
              </p>
              <h2 className="font-display text-2xl sm:text-xl font-bold text-ink">
                {isSignUp ? 'Join your neighborhood' : 'Welcome back'}
              </h2>
              <p className="mt-1 text-sm text-ink-soft">
                {isSignUp ? 'Create an account to post and message.' : 'Sign in to see what is nearby.'}
              </p>

              <div className="flex items-center gap-3 my-5">
                <span className="flex-1 h-px bg-line" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-soft">
                  {isSignUp ? 'create with email' : 'sign in with email'}
                </span>
                <span className="flex-1 h-px bg-line" />
              </div>

              {/* No max-height/overflow: a nested scroll box hid the required
                  map pin below its boundary. */}
              <form onSubmit={handleSubmit} className="space-y-3.5" noValidate>
                {formError && (
                  <div className="px-3 py-2.5 rounded-xl bg-rose-light border border-rose/30 text-rose text-sm font-medium flex items-center gap-2 animate-slide-down" role="alert">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    {formError}
                  </div>
                )}

                {notice && (
                  <div className="px-3 py-2.5 rounded-xl bg-moss-light border border-moss/30 text-moss text-sm font-medium animate-slide-down" role="status">
                    {notice}
                  </div>
                )}

                {/* Opens the map in a popup rather than embedding it in the form. */}
                {isSignUp && (
                  <div>
                    <span className="text-xs font-semibold text-ink-soft">
                      Your location <span className="text-clay">*</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsLocationOpen(true)}
                      aria-haspopup="dialog"
                      aria-invalid={fieldErrs.location ? true : undefined}
                      aria-describedby={fieldErrs.location ? 'location-err' : undefined}
                      className={`mt-1 w-full flex items-center gap-3 text-left px-3 h-12 rounded-xl border bg-card transition-colors focus-ring touch-manipulation ${
                        fieldErrs.location
                          ? 'border-rose/50 bg-rose-light'
                          : 'border-line hover:border-clay/40 hover:bg-sand/40'
                      }`}
                    >
                      <Crosshair
                        className={`w-4 h-4 flex-shrink-0 ${location ? 'text-moss' : 'text-ink-soft'}`}
                        aria-hidden="true"
                      />
                      <span className="flex-1 min-w-0">
                        {location ? (
                          <span className="block text-base font-medium text-ink truncate">
                            Pin placed at {describeArea(location)}
                          </span>
                        ) : (
                          <span className="block text-base text-ink-soft">
                            Choose on the map
                          </span>
                        )}
                      </span>
                      <span className="text-sm font-semibold text-clay flex-shrink-0">
                        {location ? 'Change' : 'Set'}
                      </span>
                    </button>
                    <FieldError id="location-err" message={fieldErrs.location} />
                  </div>
                )}

                {isSignUp && (
                  <label className="block">
                    <span className="text-xs font-semibold text-ink-soft">Full name</span>
                    <div className="relative mt-1">
                      <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-soft" aria-hidden="true" />
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Your name"
                        className={`${inputCls} ${fieldErrs.name ? inputErrCls : ''}`}
                        style={{ fontSize: 16 }}
                        required
                        autoComplete="name"
                        aria-required="true"
                        aria-invalid={fieldErrs.name ? true : undefined}
                        aria-describedby={fieldErrs.name ? 'name-err' : undefined}
                      />
                    </div>
                    <FieldError id="name-err" message={fieldErrs.name} />
                  </label>
                )}

                <label className="block">
                  <span className="text-xs font-semibold text-ink-soft">Email</span>
                  <div className="relative mt-1">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-soft" aria-hidden="true" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@domain.com"
                      className={`${inputCls} ${fieldErrs.email ? inputErrCls : ''}`}
                      style={{ fontSize: 16 }}
                      required
                      autoComplete="email"
                      aria-required="true"
                      aria-invalid={fieldErrs.email ? true : undefined}
                      aria-describedby={fieldErrs.email ? 'email-err' : undefined}
                      inputMode="email"
                    />
                  </div>
                  <FieldError id="email-err" message={fieldErrs.email} />
                </label>

                <label className="block">
                  <span className="text-xs font-semibold text-ink-soft">Password</span>
                  <div className="relative mt-1">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-soft" aria-hidden="true" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className={`${inputCls} ${fieldErrs.password ? inputErrCls : ''}`}
                      style={{ fontSize: 16 }}
                      required
                      autoComplete={isSignUp ? 'new-password' : 'current-password'}
                      aria-required="true"
                      aria-invalid={fieldErrs.password ? true : undefined}
                      aria-describedby={fieldErrs.password ? 'password-err' : undefined}
                    />
                  </div>
                  <FieldError id="password-err" message={fieldErrs.password} />
                  {isSignUp && !fieldErrs.password && (
                    <p className="mt-1 text-xs text-ink-soft">At least 8 characters.</p>
                  )}
                </label>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full h-12 rounded-xl bg-clay hover:bg-clay-hover text-white font-semibold text-base transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-ring active:scale-[0.98] touch-manipulation mt-1"
                >
                  {submitting ? (
                    // No spinner: the label itself says what is happening.
                    isSignUp ? 'Creating account...' : 'Signing in...'
                  ) : isSignUp ? 'Create account' : 'Sign in'}
                </button>
              </form>

              {isSignUp && (
                <LocationPickerModal
                  open={isLocationOpen}
                  value={location}
                  label={locationLabel}
                  onLabelChange={setLocationLabel}
                  onConfirm={(next) => {
                    setLocation(next);
                    setFieldErrs({});
                  }}
                  onClose={() => setIsLocationOpen(false)}
                />
              )}

              <button
                type="button"
                onClick={switchMode}
                disabled={submitting}
                className="mt-5 w-full text-center text-sm text-ink-soft hover:text-clay transition-colors disabled:opacity-50 touch-manipulation py-2"
              >
                {isSignUp ? 'Already a member? ' : 'New here? '}
                <span className="font-semibold underline underline-offset-4">{isSignUp ? 'Sign in' : 'Create an account'}</span>
              </button>

              <div className="mt-auto pt-6 lg:hidden">
                <p className="text-center text-xs text-ink-soft">
                  © 2026 Pulse Market
                </p>
                <nav aria-label="Legal" className="mt-1.5 flex items-center justify-center gap-3 text-xs text-ink-soft pb-[max(0.5rem,env(safe-area-inset-bottom,0px))]">
                  <a href="/privacy" className="hover:text-ink hover:underline touch-manipulation py-1">Privacy</a>
                  <span aria-hidden="true" className="text-line">·</span>
                  <span className="text-ink-muted">v{APP_VERSION}</span>
                </nav>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="hidden lg:block py-4 border-t border-line text-center shrink-0">
        <p className="text-xs text-ink-soft">
          © 2026 Pulse Market · Neighborhood marketplace
        </p>
        <nav aria-label="Legal" className="mt-1.5 flex items-center justify-center gap-3 text-[11px] text-ink-soft">
          <a href="/privacy" className="hover:text-ink hover:underline">Privacy</a>
          <span aria-hidden="true" className="text-line">·</span>
          <span className="text-ink-muted">v{APP_VERSION}</span>
        </nav>
      </footer>
    </div>
  );
};

const AlertCircle = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);
