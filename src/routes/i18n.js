import express from 'express';

const router = express.Router();

const TRANSLATIONS = {
  en: { rtl:false, tabGeneral:'General', tabFolders:'Folders', tabChannels:'Channels', tabAccount:'Account', titleGeneral:'General', titleFolders:'Manage Folders', titleChannels:'Channel Assignments', titleAccount:'Account', labelLanguage:'Language', descLanguage:'Auto-detected from your YouTube settings', labelImportFolders:'Import Folders', descImportFolders:'Restore folder structure & channel assignments from a backup', labelImportSubs:'Import Subscriptions', descImportSubs:'Restore your subscriptions list from a backup', labelExportFolders:'Export Folders', descExportFolders:'Save folder structure & channel assignments to a .json file', labelExportSubs:'Export Subscriptions', descExportSubs:'Save your subscriptions list to a .json file', btnImport:'Import', btnExport:'Export', btnSave:'Save to Database', phFolderTitle:'Folder Management', phFolderDesc:'Create, rename, reorder and delete folders directly from this panel.', phComingSoon:'Coming Soon', searchPlaceholder:'Search channels…', sectionBrowse:'Browse Subscriptions', chSubtitle:'YouTube Channel', chEmpty:'No subscriptions loaded yet.', chNoMatch:'No channels match', chipAll:'All', chipUncategorized:'Uncategorized', acctName:'Name', acctEmail:'Email', acctManage:'Manage', acctWebsite:'Go to Website', acctSignOut:'Sign out', acctSignIn:'Sign in', acctSignedOutMsg:"You're not signed in to FolderTube.", acctLoading:'Loading…', renewalPrefix:'Your plan auto-renews on', addToFolder:'Add to folder' }
};

router.get('/', (req, res) => {
  const reqLang = String(req.query.lang || 'en').trim();
  const base = reqLang.split('-')[0].toLowerCase();
  const full = reqLang.toLowerCase();

  const data = TRANSLATIONS[full] || TRANSLATIONS[base] || TRANSLATIONS.en;
  res.json({ ok: true, lang: reqLang, translations: data });
});

export default router;