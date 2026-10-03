import React from 'react';

/** Privacy, terms, licence and FAQ pages, routed on the pathname by App; nginx
 * falls back to index.html for these paths. The copy must keep matching what
 * the code does, and updated in the same change when that stops being true. */

type LegalKind = 'privacy' | 'terms' | 'faq';

interface LegalPageProps {
  kind: LegalKind;
}

const CONTACT_EMAIL = 'legal@pulse.market';
const LAST_UPDATED = '28 September 2026';

const TITLES: Record<LegalKind, string> = {
  privacy: 'Privacy Policy',
  terms: 'Terms of Use',
  faq: 'Frequently Asked Questions',
};

const NAV_LABELS: Record<LegalKind, string> = {
  privacy: 'Privacy',
  terms: 'Terms',
  faq: 'FAQ',
};

const SECTIONS: Record<LegalKind, { heading: string; body: string[] }[]> = {
  privacy: [
    {
      heading: 'What we collect',
      body: [
        'When you create an account we store your email address, a hashed password (hashed by Supabase Auth, never in plain text), and the username you choose.',
        'When you post a listing we store its title, description, price, category, any photos you upload, and a location label you pick from a list of neighborhoods. We do not ask for or store your street address.',
        'We store your conversations, reviews and in-app notifications (new messages and activity on your listings) so they can be shown to you and to the other person.',
        'If you sign in, we keep a session token in your browser so you stay logged in. It is held in session storage and is cleared when you close the tab or sign out.',
      ],
    },
    {
      heading: 'What we do not do',
      body: [
        'No advertising or analytics trackers. No third-party advertising pixels. We do not set advertising cookies.',
        'We do not sell, rent or share your personal information with advertisers or data brokers.',
        'We do not require you to verify your email address, so an email address is not proof that you own that inbox. Please use a password you do not use elsewhere.',
      ],
    },
    {
      heading: 'Photos',
      body: [
        'Photos you upload are stored on Cloudinary, a third-party image hosting provider, in a folder scoped to your user ID. Cloudinary processes the image and we configure the service to strip embedded metadata such as GPS coordinates and camera owner information.',
        'You can delete a photo you uploaded from its listing page.',
      ],
    },
    {
      heading: 'Who can see your information',
      body: [
        'Your public profile (username, avatar, bio and neighborhood) and your active listings are visible to anyone using the service, because that is what a marketplace is for.',
        'Your email address and password hash are not shown to other users.',
        'Your exact position is never shown to anyone else. Public pins are rounded to about a hundred metres, and your listings show only the neighborhood label you picked. Your own pin stays exact for you so distances can be calculated.',
      ],
    },
    {
      heading: 'Messages',
      body: [
        'Conversations and messages are stored on our servers so both people can read them, including when they come back later. They are visible to the two people in the conversation and to the operator, who may read them when handling a report. Messages are never shown publicly.',
      ],
    },
    {
      heading: 'Moderation and removal',
      body: [
        'Reports are recorded and reviewed by a person. There is no automated moderation.',
        'If you believe content violates these terms, or you want a listing or photo removed, contact us and we will action it. We aim to acknowledge within 3 business days.',
      ],
    },
    {
      heading: 'Deleting your account',
      body: [
        'There is no self-service account deletion. Email us and we will delete your account, your listings, your conversations and your uploaded photos.',
      ],
    },
    {
      heading: 'Security',
      body: [
        'Passwords are hashed by Supabase Auth. Traffic is served over HTTPS. The API validates every request and authorizes each listing change against the signed-in account.',
        'No system is perfectly secure. Please report any suspected vulnerability to us rather than disclosing it publicly.',
      ],
    },
    {
      heading: 'Changes and contact',
      body: [
        'If we change what we collect, we will update this page and the "last updated" date.',
        `Questions or requests: ${CONTACT_EMAIL}`,
      ],
    },
  ],
  terms: [
    {
      heading: 'Agreement',
      body: [
        'By creating an account you agree to these terms. If you do not agree, do not use the service.',
      ],
    },
    {
      heading: 'What Pulse Market is',
      body: [
        'Pulse Market is a community listing board. It helps people list items and find them nearby.',
        'Pulse Market is not a party to any sale. We never handle your money, we never take a cut, and we do not hold funds in escrow. Payment and handover happen directly between you and the other person.',
      ],
    },
    {
      heading: 'Your account',
      body: [
        'You are responsible for what happens under your account, including keeping your password to yourself.',
        'You must be old enough to enter a binding contract where you live, and old enough to consent to the processing of your data under the law that applies to you.',
        'One account per person. Creating extra accounts to evade a listing limit or a removal is a breach of these terms.',
      ],
    },
    {
      heading: 'What you may post',
      body: [
        'You may post only items you actually own or are authorised to sell.',
        'You may not post prohibited or regulated goods, including firearms and ammunition, controlled substances, counterfeit or stolen goods, live animals, and recalled or unsafe products.',
        'You may not post contact details, payment links, or requests for donations in a listing. Buyers and sellers can arrange handover through the service.',
        'Listings must be honest: real photos, a real price, and an accurate description. Misleading listings are removed.',
      ],
    },
    {
      heading: 'Prohibited conduct',
      body: [
        'Do not harass, threaten, stalk or impersonate anyone.',
        'Do not use the service for fraud, phishing, spam, or to distribute malware.',
        'Do not attempt to access accounts or data that are not yours, including through automated requests, scraping, or bypassing rate limits.',
        'Do not post illegal content or content that infringes someone else\'s intellectual property.',
      ],
    },
    {
      heading: 'Safety',
      body: [
        'Meet in a public place. Bring a friend. Inspect the item before paying. Do not send deposits to strangers.',
        'We do not verify sellers or buyers, and we do not verify any listing. There are no identity checks and no review of items before they go live. Judge each transaction on your own.',
        'You are responsible for your own safety. Use your own judgement and walk away from anything that feels wrong.',
      ],
    },
    {
      heading: 'Content you post',
      body: [
        'You keep ownership of the photos and text you post, and you give us a licence to host and display them for the purpose of running the service.',
        'You confirm you have the right to post what you post, and that it does not infringe anyone else\'s rights.',
        'We may remove content that breaks these terms, and we may remove listings that we reasonably believe are illegal.',
      ],
    },
    {
      heading: 'Availability and changes',
      body: [
        'The service is provided as-is. We do not guarantee it will be available, uninterrupted, or free of defects.',
        'We may change, suspend or discontinue any part of the service, and these terms may change. Continued use after a change means you accept the updated terms.',
      ],
    },
    {
      heading: 'Liability',
      body: [
        'To the fullest extent the law allows, Pulse Market is not liable for lost profits, lost data, or any indirect or consequential loss arising from your use of the service.',
        'Nothing in these terms excludes liability that cannot legally be excluded, including for fraud or where applicable consumer law applies to you as a consumer.',
      ],
    },
    {
      heading: 'Governing law and contact',
      body: [
        'These terms are governed by the laws of the jurisdiction in which the operator is established, and disputes are subject to the courts of that jurisdiction. The applicable jurisdiction is confirmed on this page before the service is offered commercially.',
        `Questions, complaints or reports: ${CONTACT_EMAIL}`,
      ],
    },
  ],
  faq: [
    {
      heading: 'What is Pulse Market?',
      body: [
        'A neighborhood marketplace. You post items you want to sell, people nearby browse them on the map or in the feed, and you arrange the handover through in-app chat.',
      ],
    },
    {
      heading: 'Does it cost anything?',
      body: [
        'No. Posting, browsing, messaging and reviews are all free. Pulse Market never takes a commission and never handles money.',
      ],
    },
    {
      heading: 'How do I post an item?',
      body: [
        'Tap Sell, add a title, price, description, category and a photo or two, pick your area, and publish. Your listing shows up for people browsing near you.',
      ],
    },
    {
      heading: 'How do buyers contact me?',
      body: [
        'They open your listing and start a chat. Messages arrive while the app is open, unread activity shows up in your notifications, and you reply from the Chats tab.',
      ],
    },
    {
      heading: 'How does payment work?',
      body: [
        'It does not go through us. Agree a price in chat, meet, inspect the item, and pay however you both prefer. We never see your payment details.',
      ],
    },
    {
      heading: 'How do I mark an item as reserved or sold?',
      body: [
        'Open your profile, go to My listings, and use the status selector on the card. Reserved and sold items stay visible, clearly labelled.',
      ],
    },
    {
      heading: 'How do reviews work?',
      body: [
        'Once an item is marked sold, each person in that conversation can leave one review - a rating and a short comment. Your rating and reviews show on your profile.',
      ],
    },
    {
      heading: 'How do I report something?',
      body: [
        'Open the listing and use Report, then pick a reason. Reports are reviewed by a person. For a removal request, email us directly at ' + CONTACT_EMAIL + '.',
      ],
    },
    {
      heading: 'Is my exact location shared?',
      body: [
        'No. Other people see the neighborhood label you chose and a pin rounded to about a hundred metres. Your exact position stays on your account so distances can be calculated.',
      ],
    },
    {
      heading: 'How do I change my area?',
      body: [
        'Move the pin from the map, or update it from your profile\'s settings. Listings and distances use the area you set.',
      ],
    },
    {
      heading: 'Can I delete my account?',
      body: [
        'There is no self-service deletion yet - email ' + CONTACT_EMAIL + ' and we will delete your account, listings, conversations and photos.',
      ],
    },
    {
      heading: 'What works offline?',
      body: [
        'While offline you still see your last saved results and the cached map. Posting and messaging resume once you are back online.',
      ],
    },
  ],
};

const KIND_ORDER: LegalKind[] = ['faq', 'terms', 'privacy'];

export const LegalPage: React.FC<LegalPageProps> = ({ kind }) => {
  const title = TITLES[kind];
  const sections = SECTIONS[kind];

  return (
    <div className="min-h-full app-height overflow-y-auto overscroll-none bg-paper text-ink">
      {/* Opaque top strip + safe-area so the back link is not drawn under the
          iOS status bar in the home-screen PWA (where it looked invisible). */}
      <header className="sticky top-0 z-[var(--z-sticky)] bg-paper border-b border-line safe-top">
        <div className="mx-auto max-w-2xl px-5 h-14 flex items-center">
          <a
            href="/"
            className="inline-flex items-center gap-1.5 text-base font-semibold text-ink hover:text-clay transition-colors touch-manipulation focus-ring rounded-sm"
          >
            <span aria-hidden="true">&larr;</span>
            Back to Pulse Market
          </a>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-5 py-8 sm:py-12 pb-[max(2rem,env(safe-area-inset-bottom,0px))]">
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-ink">{title}</h1>
        <p className="mt-2 text-sm text-ink-soft">Last updated {LAST_UPDATED}</p>

        <nav aria-label="Help and legal pages" className="mt-5 flex flex-wrap gap-2 text-sm">
          {KIND_ORDER.map((k) => (
            <a
              key={k}
              href={`/${k}`}
              className={`h-10 px-4 rounded-full grid place-items-center font-semibold transition-colors touch-manipulation focus-ring ${
                kind === k
                  ? 'bg-clay text-white'
                  : 'bg-card border border-line text-ink hover:bg-sand'
              }`}
              aria-current={kind === k ? 'page' : undefined}
            >
              {NAV_LABELS[k]}
            </a>
          ))}
        </nav>

        <div className="mt-8 space-y-7">
          {sections.map((section) => (
            <section key={section.heading}>
              <h2 className="font-display text-lg font-bold text-ink">{section.heading}</h2>
              <div className="mt-2 space-y-3">
                {section.body.map((paragraph) => (
                  <p key={paragraph} className="text-base leading-relaxed text-ink-soft">
                    {paragraph}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <p className="mt-10 border-t border-line pt-5 text-xs text-ink-muted">
          This page is a plain-language summary. It is not legal advice. If you need advice
          about your own situation, speak to a qualified lawyer in your jurisdiction.
        </p>
      </div>
    </div>
  );
};
