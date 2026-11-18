# PACE Privacy Policy

**Effective date:** 2026-11-18  
**Service:** PACE 沛速車隊 (https://cycling-power.vercel.app, LINE LIFF)  
**Data controller:** PACE沛速車隊 (PACE Cycling Team), operator of the PACE cycling team app  
**Contact email:** thewayzstore@gmail.com  
**Location:** Taiwan

This Policy explains how we collect, use, store, delete, and protect your personal data, including data we obtain through the Strava API if you choose to connect your Strava account. By using the service you acknowledge this Policy. If you do not agree, do not connect Strava, and you may ask us to delete your data.

This Policy does not modify, conflict with, or supersede the [Strava Privacy Policy](https://www.strava.com/legal/privacy). If there is a conflict about data obtained through the Strava API, the Strava Privacy Policy controls.

We handle personal data in accordance with applicable law, including Taiwan’s Personal Data Protection Act and, where they apply, the EU GDPR and UK GDPR. The Strava API Policy requires developers to provide a privacy policy that meets the requirements of the GDPR and the UK GDPR.

---

## 1. Data we collect

### 1.1 Data you provide in PACE

- Identifiers and basic profile information obtained when you sign in with LINE (for example a LINE user identifier, display name, and photo, limited to what LINE actually authorizes).
- Information you enter or update in the team app, such as a bio, weight, PACE FTP, bikes and wheelsets, maintenance records, ride sign-ups and attendance, and visibility settings.
- Content you voluntarily upload or type in connection with group rides (for example a route file or notes).

### 1.2 Data we obtain from Strava on your behalf

We access your Strava data only after you tap “Connect with Strava” and grant consent on Strava’s authorization screen. We currently request the scopes `activity:read_all` and `profile:read_all`. You may deselect scopes on Strava’s screen. We check the scopes actually granted and do not read data that is out of scope.

Data we may obtain includes:

- Athlete profile: Strava athlete identifier, name, the list of bikes associated with your rides, and (where the scope allows) FTP.
- Activity data: activity identifier, name, type, start time, moving and elapsed time, distance, elevation gain, device name, associated gear identifier, and route data used to detect a path or summit (for example a polyline).
- The authorization itself: access and refresh tokens, granted scopes, and webhook events (new activities, updates or deletions, and deauthorization).

We do not write data back to Strava (we do not request `profile:write` or `activity:write`).

### 1.3 Technical data

Our hosts and backend providers may keep limited technical records needed to operate the service, such as request times, security logs, and error logs. We do not use these logs to profile you for advertising.

Strava may monitor and collect Usage Data and may use Usage Data for any business purpose, internal or external, including providing enhancements to the Strava API Materials or the Strava Platform, providing developer or user support, and ensuring compliance with the Strava API Agreement. We include this statement as required by Strava API Policy §6.5.

---

## 2. How we collect data

- You enter or upload it in PACE.
- LINE LIFF sign-in and authorization.
- You complete Strava’s OAuth flow after tapping the official “Connect with Strava” button.
- After you connect, we read your athlete and activity data through the Strava API. We may receive webhooks for new, updated, or deleted activities, and we may sync when you ask us to.
- When you first connect, if you agree, we run a **one-time** scan of your past rides solely to find possible personal summit achievements. Each badge is awarded only after you confirm it.

---

## 3. Purposes

We use this data only to provide the team service:

- To sign you in, recognize you as a team member, and show your profile and settings.
- To manage group-ride sign-ups, one-tap attendance confirmation, badges, garage mileage, and maintenance reminders.
- To compare your own Strava rides with a group ride or a summit rule **on a screen only you can see**, and to write a PACE record only after you confirm.
- To update the FTP stored in PACE after you confirm a value read from Strava.
- To handle disconnect, deletion, or support requests, and to maintain security and fix faults.
- To meet legal obligations and the Strava API terms (including ceasing use of Strava Data after you revoke access or delete an activity).

We do **not**:

- Display one member’s Strava Data to other members.
- Use Strava Data (including derived, aggregated, or de-identified forms) to train, evaluate, or operate any AI or machine-learning system, or for retrieval-augmented generation.
- Sell Strava Data, or disclose it to advertisers or data brokers.
- Charge users any fee for access to or use of Strava API functionality.

---

## 4. Retention

- **Raw Strava data and pending confirmation items** (for example cached activity name, time, distance, route data, and unconfirmed badge, attendance, or FTP prompts) are held only as a short-term cache for **no more than seven (7) days**, then deleted. If you delete the underlying data on Strava, we remove it from the cache as soon as we are notified, and in any event we stop displaying or using it within 48 hours.
- **Authorization tokens** are kept only while your connection remains active, and are deleted when you disconnect or revoke access.
- **Confirmed PACE records** (for example confirmed attendance, personal badges, a PACE FTP you agreed to store, and garage mileage you confirmed) are kept as your club records until you ask us to delete them or your team account ends.
- **Team account data** (sign-ups, profile, and similar) is kept while you remain a member, and is handled under Section 6 when you ask us to delete it or the account ends.

---

## 5. Who processes your data

We use the following subprocessors to provide the service. We are responsible for their processing and require them to protect data no less carefully than this Policy:

- **LINE**, for sign-in and the LIFF runtime.
- **Supabase**, for the database and backend functions.
- **Vercel**, for website hosting.

Processing may take place outside Taiwan. Where the GDPR or UK GDPR applies, international transfers are made under the applicable Standard Contractual Clauses or another lawful mechanism.

We do not disclose your personal data to other third parties except as needed to provide the service, as required by law, or at your direction. We do not transfer Strava Data to AI providers.

If Strava asks for a current list of subprocessors that process Strava Data on our behalf, we will provide it.

---

## 6. Your rights and choices

Depending on applicable law, you may have the right to access, obtain a copy of, correct, or delete your data, to withdraw consent, to restrict processing, and to lodge a complaint with a supervisory authority (in Taiwan, the authority responsible for personal-data protection; where the GDPR applies, your local data-protection authority).

### 6.1 Access

You can review the data we hold about you in the app (Profile, Garage, your personal page, and confirmation prompts). You may also email thewayzstore@gmail.com and ask for a copy of your data.

### 6.2 Withdrawing Strava consent and deleting Strava Data

You may withdraw consent either way:

- Tap “Disconnect” in the Strava section of PACE; or
- Revoke the app in your Strava connected-apps settings: https://www.strava.com/settings/apps

After disconnect or revocation we delete the connection, tokens, cached activities, and pending confirmation items. We provide written confirmation in the app. If you revoke access in Strava, we show that confirmation the next time you open the app, or we notify you separately. Under the Strava API Policy this deletion is completed expeditiously and in any event within thirty (30) days.

By default, PACE records you have **already confirmed** (attendance, badges, and a confirmed PACE FTP) remain as your own club declarations. They are no longer held as a raw Strava cache. If you want those records deleted as well, tell us when you disconnect, or email thewayzstore@gmail.com, and we will delete them too.

### 6.3 Requests to delete all personal data

Email thewayzstore@gmail.com and say what you want deleted. We will handle the request in a reasonable time and write back to confirm the result. If the law requires us to keep a particular record, we will explain that.

### 6.4 Links to your Strava account

- Profile and privacy settings: https://www.strava.com/settings/profile
- Connected apps: https://www.strava.com/settings/apps
- Strava Privacy Policy: https://www.strava.com/legal/privacy

---

## 7. Security

We use reasonable and appropriate administrative, technical, and organizational measures to protect the security and integrity of data, including access controls, encrypted transport, and storing Strava tokens in a restricted backend. No transmission over the internet is completely secure, and we keep these measures under review.

---

## 8. Children

This service is a team tool for club members and is not directed at children. We do not knowingly collect personal data from children.

---

## 9. Changes

We may update this Policy and will post the current version and its effective date on this page. If the types of Strava data we collect change, we will notify you before the change and obtain your consent to the new scope.

---

## 10. Contact

For questions about this Policy, or to request access or deletion:

**thewayzstore@gmail.com**

PACE沛速車隊 (PACE Cycling Team)  
Taiwan
