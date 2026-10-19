/**
 * The Privacy Policy and Terms of Service. Every statement here describes what
 * the application actually does; change the code and this together. Neither
 * page makes a claim of legal compliance.
 */
export const legal = {
  updatedLabel: "Last updated",
  contactPrompt: "Questions about this page?",
  contactLink: "Contact us",
  privacy: {
    metaTitle: "Privacy Policy",
    metaDescription: "What Sermon Tracker collects, where it is kept, and how to delete it.",
    title: "Privacy Policy",
    intro:
      "Sermon Tracker is a workspace for preachers. This page explains what information it keeps, why, which services handle it, and how you can delete it.",
    sections: [
      {
        heading: "What you give us",
        paragraphs: [
          "Your account: your name, email address, profile picture, and sign-in details (a password or a Google account). These are held by Clerk, our sign-in provider.",
          "Your work: sermon and point ideas, tags, outlines, Scripture references, saved favorites and highlights, your preaching record (dates, places, and occasions), and the optional church, ministry role, and preaching-class answers in your profile.",
          "Your preferences: interface language, Bible translation, notification choices, and similar settings.",
          "Support: messages you send through Help & Feedback or the contact form, any screenshots you attach, and the page and browser details a bug report includes. The contact form also asks for a name and email address so we can reply.",
        ],
      },
      {
        heading: "What is recorded automatically",
        paragraphs: [
          "When the public contact form is used, a one-way hash of the sender's network address is stored to limit abuse. The address itself is not stored.",
          "Our hosting provider keeps standard server logs. Sermon Tracker does not include advertising, analytics, or tracking scripts.",
        ],
      },
      {
        heading: "How it is used",
        paragraphs: [
          "To run the service: show you your own work, keep it in step across your devices, answer your support messages, and send the notifications and emails you have chosen.",
          "Your ideas, outlines, and preaching record are private to your account. Administrators can see the people who have accounts and the support conversations sent to them; they do not have a screen for reading another account's ideas or outlines.",
        ],
      },
      {
        heading: "Services that handle it",
        paragraphs: [
          "Clerk (sign-in and account identity), Neon (the database), Vercel (hosting, and private storage for support screenshots), and Resend (sending email).",
          "If you turn on push notifications, your browser's push service (for example Apple, Google, or Mozilla) delivers them. A push message contains only a short generic line and a link, never what anyone wrote.",
        ],
      },
      {
        heading: "On your device",
        paragraphs: [
          "Cookies keep you signed in (Clerk) and remember your language. Your browser's storage keeps your theme and display choices and, if you use offline features, downloaded Bible text, copies of your ideas and outlines, and changes waiting to be sent.",
          "You can clear these at any time in your browser. Changes that have not been sent yet are lost if you do.",
        ],
      },
      {
        heading: "Emails and notifications",
        paragraphs: [
          "Emails about replies and status changes on your feedback are optional and can be turned off in Settings, Notifications. Messages about signing in and your account's security are always sent. Push notifications are sent only to devices where you turn them on.",
        ],
      },
      {
        heading: "Deleting your account",
        paragraphs: [
          "You can delete your account at any time in Settings, Account & Security. This permanently removes your work, preferences, support conversations and screenshots, notifications, push devices, and your sign-in identity. Replies an administrator wrote on someone else's conversation stay with that conversation, without their name.",
          "Deleted data may remain in our providers' backups for a limited time before it is overwritten.",
        ],
      },
      {
        heading: "Changes",
        paragraphs: ["If this policy changes, the new version is posted here with a new date."],
      },
    ],
  },
  terms: {
    metaTitle: "Terms of Service",
    metaDescription: "The terms for using Sermon Tracker.",
    title: "Terms of Service",
    intro:
      "These terms apply when you use Sermon Tracker. By creating an account or using the service, you agree to them.",
    sections: [
      {
        heading: "Your account",
        paragraphs: [
          "Give accurate information when you sign up, and keep your sign-in details to yourself. You are responsible for what happens under your account.",
        ],
      },
      {
        heading: "Your content",
        paragraphs: [
          "What you write in Sermon Tracker is yours. You allow us to store, process, and display it only as needed to provide the service to you. You can delete it, or your whole account, at any time.",
        ],
      },
      {
        heading: "Acceptable use",
        paragraphs: [
          "Do not use the service to break the law, to harm or harass others, to send spam, or to interfere with the service or other people's accounts. Do not try to reach data that is not yours.",
        ],
      },
      {
        heading: "Bible texts",
        paragraphs: [
          "The Bible translations shown in Sermon Tracker belong to their rights holders and are provided for reading and study within the service.",
        ],
      },
      {
        heading: "The service",
        paragraphs: [
          "We work to keep Sermon Tracker available and your work safe, but the service is provided as it is, without guarantees that it will always be available or free of errors. Keep your own copies of anything you cannot afford to lose.",
          "We may change or discontinue features. We may suspend or close an account that breaks these terms.",
        ],
      },
      {
        heading: "Changes to these terms",
        paragraphs: [
          "If these terms change, the new version is posted here with a new date. Continuing to use the service after that means you accept them.",
        ],
      },
    ],
  },
};
