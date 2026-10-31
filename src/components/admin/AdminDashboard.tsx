import React, { useState, useEffect } from 'react';
import { useTournament } from '../../context/TournamentContext';
import { isSuratKeteranganRequired } from '../../shared/registrationRules';
import {
  AdminRole,
  AdminUser,
  CategoryDetail,
  CommitteeBankAccount,
  CommitteeContact,
  CommitteeEmail,
  DownloadableDoc,
  MatchItem,
  MatchStatus,
  PageSectionsVisibility,
  PaymentStatus,
  RegistrationItem,
  RegistrationStatus,
  SponsorItem,
  SponsorTier,
  TournamentCategory,
  UploadedDoc,
  RegistrationButtonMode,
} from '../../types';
import { formatExternalLink } from '../../utils/registrationStatus';
import { WabupCupLogo } from '../WabupCupLogo';
import { PdfViewerModal } from './PdfViewerModal';
import { InvoiceModal } from '../InvoiceModal';
import { DatabaseManagerTab } from './DatabaseManagerTab';
import { AdminUsersManagerTab } from './AdminUsersManagerTab';
import { SectionBackgroundManager } from './SectionBackgroundManager';
import { GroupStageDragDropManager } from './GroupStageDragDropManager';
import { PlayerManagerTab } from './PlayerManagerTab';
import { LiveScoreManagerTab } from './LiveScoreManagerTab';
import { DEFAULT_SIGNATURE_SVG, DEFAULT_STAMP_SVG } from '../../utils/signatureAndStamp';
import { downloadOfficialInvoicePdf } from '../../utils/invoicePdf';
import { compressLogo } from '../../utils/imageCompressor';
import { uploadToTiDbStorage, deleteMediaFromStorage } from '../../utils/blobUpload';
import {
  exportRegistrationsToExcel,
  exportRegistrationsToPdf,
} from '../../utils/exportUtils';
import {
  SETUP_GS_CODE,
  CODE_GS_CODE,
  INDEX_HTML_STANDALONE_TEMPLATE,
  DEPLOYMENT_AND_GIT_GUIDE,
} from '../../utils/gasCodeGenerator';
import {
  Database,
  Server,
  Shield,
  Palette,
  Users,
  Trophy,
  Award,
  Calendar,
  Layers,
  Flame,
  Zap,
  Search,
  CheckCircle2,
  Clock,
  XCircle,
  Phone,
  FileText,
  Trash2,
  Edit,
  Plus,
  RefreshCw,
  LogOut,
  Lock,
  Download,
  Copy,
  ExternalLink,
  Shuffle,
  Activity,
  Sliders,
  DollarSign,
  AlertTriangle,
  FileCode,
  Globe,
  Sparkles,
  ArrowRight,
  Eye,
  Upload,
  Loader2,
  Image as ImageIcon,
  Link as LinkIcon,
  Check,
  X,
  Settings,
  Mail,
  CreditCard,
  FileSpreadsheet,
  FolderDown,
  Building,
  MapPin,
  Save,
  HelpCircle,
  CheckSquare,
  Share2,
  AlertCircle,
  GripVertical,
  ArrowUp,
  ArrowDown,
  Menu,
  ChevronLeft,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  LayoutGrid,
  Sun,
  Moon,
  ArrowLeft,
  UserPlus,
} from 'lucide-react';

interface AdminDashboardProps {
  onClose: () => void;
  isStandalonePage?: boolean;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onClose, isStandalonePage = false }) => {
  const {
    theme,
    toggleTheme,
    currentAdmin,
    loginAdmin,
    logoutAdmin,
    registrations,
    updateRegistration,
    updateRegistrationStatus,
    updatePaymentStatus,
    deleteRegistration,
    categories,
    addCategory,
    updateCategory,
    deleteCategory,
    reorderCategories,
    syncCategoryQuotas,
    matches,
    addMatch,
    updateMatch,
    deleteMatch,
    randomizeMatchesForCategory,
    checkCanDrawNextRound,
    sponsors,
    addSponsor,
    updateSponsor,
    deleteSponsor,
    adminUsers,
    addAdminUser,
    deleteAdminUser,
    resetAllDataToDefaults,
    getWhatsAppNotificationUrl,
    config,
    updateConfig,
    downloadableDocs,
    addDownloadableDoc,
    updateDownloadableDoc,
    deleteDownloadableDoc,
    committeeContacts,
    addCommitteeContact,
    updateCommitteeContact,
    deleteCommitteeContact,
    setPrimaryCommitteeContact,
    committeeEmails,
    addCommitteeEmail,
    updateCommitteeEmail,
    deleteCommitteeEmail,
    bankAccounts,
    addBankAccount,
    updateBankAccount,
    deleteBankAccount,
    setPrimaryBankAccount,
    dbStatus,
    refreshDataFromServer,
    isSyncingWithServer,
  } = useTournament();

  // Manual Refresh Data state
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const [refreshToast, setRefreshToast] = useState<string | null>(null);

  const handleRefreshData = async () => {
    try {
      setIsManualRefreshing(true);
      await refreshDataFromServer();
      setRefreshToast('Data berhasil diperbarui!');
      setTimeout(() => {
        setRefreshToast(null);
      }, 3000);
    } catch (err) {
      console.error('Failed to refresh data from server:', err);
      setRefreshToast('Gagal menyinkronkan data.');
      setTimeout(() => {
        setRefreshToast(null);
      }, 3000);
    } finally {
      setIsManualRefreshing(false);
    }
  };

  // Login credentials state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Active CMS Navigation Tab
  type CmsTab =
    | 'OVERVIEW'
    | 'ALL_REGISTRATIONS'
    | 'PENDING_PAYMENT'
    | 'APPROVED_TEAMS'
    | 'REJECTED_TEAMS'
    | 'DRAWING_RANDOMIZER'
    | 'SCHEDULE_LIVESCORE'
    | 'PLAYER_MANAGER'
    | 'CATEGORIES_PRIZES'
    | 'SPONSORS'
    | 'SETTINGS'
    | 'ADMIN_USERS'
    | 'MYSQL_DATABASE_MANAGER'
    | 'GAS_EXPORT_GUIDE';

  const [activeTab, setActiveTab] = useState<CmsTab>('OVERVIEW');

  // Responsive Collapsible Sidebar state (persisted to localStorage)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('wabupcup_admin_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const toggleSidebarCollapse = () => {
    setIsSidebarCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem('wabupcup_admin_sidebar_collapsed', String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  // Mobile Drawer State
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState<boolean>(false);

  // Match Schedule Category Filter
  const [selectedMatchCategory, setSelectedMatchCategory] = useState<string>('ALL');

  // Role permissions evaluation
  const isSuperAdmin = currentAdmin?.role === 'SUPERADMIN';
  const isPanitiaInti = currentAdmin?.role === 'PANITIA_INTI' || currentAdmin?.role === 'PANITIA';
  const isPanitiaUmum = currentAdmin?.role === 'PANITIA_UMUM';
  const isWasitOrOperator = currentAdmin?.role === 'WASIT' || currentAdmin?.role === 'OPERATOR';

  // Specific capability permissions
  const canManageCategories = isSuperAdmin || isPanitiaInti;
  const canManageDrawing = isSuperAdmin || isPanitiaInti;
  const canManageSponsors = isSuperAdmin || isPanitiaInti;
  const canManageSettings = isSuperAdmin || isPanitiaInti;
  const canManageAdminUsers = isSuperAdmin;
  const canManageDatabase = isSuperAdmin;
  const canCrudRegistrations = isSuperAdmin || isPanitiaInti || isPanitiaUmum;
  const canCrudMatches = isSuperAdmin || isPanitiaInti || isPanitiaUmum;

  // Auto-enforce role tab restrictions
  useEffect(() => {
    if (!currentAdmin) return;
    if (isWasitOrOperator) {
      if (activeTab !== 'SCHEDULE_LIVESCORE') {
        setActiveTab('SCHEDULE_LIVESCORE');
      }
    } else if (isPanitiaUmum) {
      const allowedPanitiaUmum: CmsTab[] = [
        'OVERVIEW',
        'ALL_REGISTRATIONS',
        'PENDING_PAYMENT',
        'APPROVED_TEAMS',
        'REJECTED_TEAMS',
        'SCHEDULE_LIVESCORE',
      ];
      if (!allowedPanitiaUmum.includes(activeTab)) {
        setActiveTab('OVERVIEW');
      }
    } else if (isPanitiaInti) {
      const forbiddenPanitiaInti: CmsTab[] = [
        'ADMIN_USERS',
        'MYSQL_DATABASE_MANAGER',
      ];
      if (forbiddenPanitiaInti.includes(activeTab)) {
        setActiveTab('OVERVIEW');
      }
    }
  }, [currentAdmin, activeTab, isWasitOrOperator, isPanitiaUmum, isPanitiaInti]);

  // Category Drag and Drop State & Handlers
  const [draggedCategoryIndex, setDraggedCategoryIndex] = useState<number | null>(null);
  const [dragOverCategoryIndex, setDragOverCategoryIndex] = useState<number | null>(null);
  const [isSavingCategoryOrder, setIsSavingCategoryOrder] = useState(false);
  const [categoryOrderToast, setCategoryOrderToast] = useState<string | null>(null);

  const handleCategoryDragStart = (e: React.DragEvent, index: number) => {
    setDraggedCategoryIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleCategoryDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverCategoryIndex !== index) {
      setDragOverCategoryIndex(index);
    }
  };

  const handleCategoryDrop = async (targetIndex: number) => {
    if (draggedCategoryIndex === null || draggedCategoryIndex === targetIndex) {
      setDraggedCategoryIndex(null);
      setDragOverCategoryIndex(null);
      return;
    }

    const updated = [...categories];
    const [movedItem] = updated.splice(draggedCategoryIndex, 1);
    updated.splice(targetIndex, 0, movedItem);

    setDraggedCategoryIndex(null);
    setDragOverCategoryIndex(null);

    setIsSavingCategoryOrder(true);
    try {
      await reorderCategories(updated);
      setCategoryOrderToast(`Urutan kategori "${movedItem.name}" berhasil dipindahkan ke posisi #${targetIndex + 1}! Urutan landing page telah diperbarui.`);
      setTimeout(() => setCategoryOrderToast(null), 4000);
    } catch (err) {
      console.warn('Gagal menyimpan urutan kategori:', err);
    } finally {
      setIsSavingCategoryOrder(false);
    }
  };

  const handleMoveCategoryStep = async (fromIndex: number, direction: 'UP' | 'DOWN') => {
    const targetIndex = direction === 'UP' ? fromIndex - 1 : fromIndex + 1;
    if (targetIndex < 0 || targetIndex >= categories.length) return;

    const updated = [...categories];
    const [movedItem] = updated.splice(fromIndex, 1);
    updated.splice(targetIndex, 0, movedItem);

    setIsSavingCategoryOrder(true);
    try {
      await reorderCategories(updated);
      setCategoryOrderToast(`Urutan kategori "${movedItem.name}" berhasil dipindahkan ke posisi #${targetIndex + 1}! Urutan landing page telah diperbarui.`);
      setTimeout(() => setCategoryOrderToast(null), 4000);
    } catch (err) {
      console.warn('Gagal memindahkan urutan kategori:', err);
    } finally {
      setIsSavingCategoryOrder(false);
    }
  };

  // Settings Sub-Tab State
  type SettingsSubTab = 'DOCS' | 'WHATSAPP' | 'EMAIL' | 'BANK' | 'QUOTA' | 'VISIBILITY' | 'BACKGROUNDS' | 'SIGNATURE_STAMP' | 'GENERAL';
  const [settingsSubTab, setSettingsSubTab] = useState<SettingsSubTab>('DOCS');
  const [quotaSaveSuccess, setQuotaSaveSuccess] = useState(false);
  const [visibilitySaveSuccess, setVisibilitySaveSuccess] = useState(false);
  const [signatureSaveSuccess, setSignatureSaveSuccess] = useState(false);

  // Official Invoice Modal State
  const [selectedInvoiceItem, setSelectedInvoiceItem] = useState<RegistrationItem | null>(null);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);

  const handleOpenInvoice = (item: RegistrationItem) => {
    setSelectedInvoiceItem(item);
    setIsInvoiceModalOpen(true);
  };

  // Category CRUD Modal State
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryDetail | null>(null);
  const [categoryForm, setCategoryForm] = useState<{
    id: string;
    name: string;
    ageRestriction: string;
    description: string;
    maxTeams: number;
    registrationFee: number;
    totalPrize: number;
    prizes: { rank: string; prizeMoney: number; trophy?: string }[];
    rules: string[];
  }>({
    id: '',
    name: '',
    ageRestriction: '',
    description: '',
    maxTeams: 16,
    registrationFee: 500000,
    totalPrize: 10000000,
    prizes: [
      { rank: 'Juara 1', prizeMoney: 5000000, trophy: 'Piala Bergilir + Medali Emas' },
      { rank: 'Juara 2', prizeMoney: 3000000, trophy: 'Piala Tetap + Medali Perak' },
      { rank: 'Juara 3 Bersama', prizeMoney: 1500000, trophy: 'Piala Tetap + Medali Perunggu' },
    ],
    rules: [
      'Wajib melampirkan berkas dokumen persyaratan resmi PDF.',
      'Pemain dan official wajib mematuhi seluruh regulasi turnamen.',
    ],
  });

  // 1. Downloadable Document Form State
  const [docModalOpen, setDocModalOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<DownloadableDoc | null>(null);
  const [docForm, setDocForm] = useState<{
    title: string;
    category: string;
    description: string;
    fileName: string;
    fileSize: string;
    fileUrl: string;
    fileType: 'PDF' | 'DOCX' | 'XLSX' | 'ZIP' | 'IMAGE' | 'OTHER';
    isPrimary: boolean;
  }>({
    title: '',
    category: 'Formulir Pendaftaran',
    description: '',
    fileName: '',
    fileSize: '1.2 MB',
    fileUrl: '',
    fileType: 'PDF',
    isPrimary: false,
  });
  const [docFileSource, setDocFileSource] = useState<'UPLOAD' | 'URL'>('UPLOAD');
  const [docFilePreview, setDocFilePreview] = useState<string>('');
  const [docUploading, setDocUploading] = useState<boolean>(false);
  const [docUploadProgress, setDocUploadProgress] = useState<number>(0);

  // 2. Committee Contact (WA) Form State
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<CommitteeContact | null>(null);
  const [contactForm, setContactForm] = useState<{
    name: string;
    phone: string;
    role: string;
    isPrimary: boolean;
  }>({
    name: '',
    phone: '',
    role: '',
    isPrimary: false,
  });

  // 3. Committee Email Form State
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [editingEmail, setEditingEmail] = useState<CommitteeEmail | null>(null);
  const [emailForm, setEmailForm] = useState<{
    title: string;
    email: string;
    isPrimary: boolean;
  }>({
    title: '',
    email: '',
    isPrimary: false,
  });

  // 4. Committee Bank Account Form State
  const [bankModalOpen, setBankModalOpen] = useState(false);
  const [editingBank, setEditingBank] = useState<CommitteeBankAccount | null>(null);
  const [bankForm, setBankForm] = useState<{
    bankName: string;
    accountNumber: string;
    accountHolder: string;
    branchName: string;
    instructions: string;
    isPrimary: boolean;
  }>({
    bankName: '',
    accountNumber: '',
    accountHolder: '',
    branchName: '',
    instructions: '',
    isPrimary: false,
  });

  // 5. General Tournament Info Form State
  const [generalConfigForm, setGeneralConfigForm] = useState({
    name: config.name,
    edition: config.edition,
    tagline: config.tagline,
    registrationDeadline: config.registrationDeadline,
    tournamentStartDate: config.tournamentStartDate,
    tournamentEndDate: config.tournamentEndDate,
    venueName: config.venueName,
    venueAddress: config.venueAddress,
    venueCity: config.venueCity,
    googleMapsEmbedUrl: config.googleMapsEmbedUrl,
    totalPrizePool: config.totalPrizePool,
    wabupLogoUrl: config.wabupLogoUrl || '',
    panitiaLogoUrl: config.panitiaLogoUrl || '',
  });
  const [generalSaveSuccess, setGeneralSaveSuccess] = useState(false);

  // 6. Registration Button Mode & Custom Link Form State
  const [regButtonMode, setRegButtonMode] = useState<RegistrationButtonMode>(
    config.registrationButtonMode ||
      ((config.sectionsVisibility?.registrationButton ?? true) === false ? 'HIDDEN' : 'INTERNAL_FORM')
  );
  const [regCustomLink, setRegCustomLink] = useState(config.registrationCustomLink || '');
  const [regCustomBtnText, setRegCustomBtnText] = useState(config.registrationCustomButtonText || '');
  const [regCustomNewTab, setRegCustomNewTab] = useState(config.registrationCustomLinkNewTab !== false);
  const [regButtonSaveSuccess, setRegButtonSaveSuccess] = useState(false);

  useEffect(() => {
    if (config) {
      const inferredMode: RegistrationButtonMode =
        config.registrationButtonMode ||
        ((config.sectionsVisibility?.registrationButton ?? true) === false ? 'HIDDEN' : 'INTERNAL_FORM');
      setRegButtonMode(inferredMode);
      setRegCustomLink(config.registrationCustomLink || '');
      setRegCustomBtnText(config.registrationCustomButtonText || '');
      setRegCustomNewTab(config.registrationCustomLinkNewTab !== false);
    }
  }, [
    config.registrationButtonMode,
    config.registrationCustomLink,
    config.registrationCustomButtonText,
    config.registrationCustomLinkNewTab,
    config.sectionsVisibility?.registrationButton,
  ]);

  const handleSaveRegistrationButtonSettings = (
    modeToSave: RegistrationButtonMode = regButtonMode,
    linkToSave: string = regCustomLink,
    btnTextToSave: string = regCustomBtnText,
    newTabToSave: boolean = regCustomNewTab
  ) => {
    const currentVis = config.sectionsVisibility || {
      hero: true,
      liveScore: true,
      categories: true,
      bracket: true,
      venue: true,
      sponsors: true,
      klasemenLanding: true,
      standaloneKlasemen: true,
      landingKlasemen: true,
      landingSchedule: true,
      landingBracket: true,
      landingTopScorer: true,
      standaloneTabKlasemen: true,
      standaloneTabJadwal: true,
      standaloneTabKnockout: true,
      standaloneTabTopScore: true,
      registrationButton: true,
    };
    const isVisible = modeToSave !== 'HIDDEN';
    const formattedLink = linkToSave.trim() ? formatExternalLink(linkToSave.trim()) : '';
    updateConfig({
      registrationButtonMode: modeToSave,
      registrationCustomLink: formattedLink,
      registrationCustomButtonText: btnTextToSave.trim(),
      registrationCustomLinkNewTab: newTabToSave,
      sectionsVisibility: {
        ...currentVis,
        registrationButton: isVisible,
      },
    });
    setRegButtonSaveSuccess(true);
    setTimeout(() => setRegButtonSaveSuccess(false), 2500);
  };

  const handleQuickSetRegistrationMode = (newMode: RegistrationButtonMode) => {
    setRegButtonMode(newMode);
    handleSaveRegistrationButtonSettings(newMode, regCustomLink, regCustomBtnText, regCustomNewTab);
  };

  // Quota Handlers
  const handleForceSyncQuotas = async () => {
    try {
      await reorderCategories(categories);
      await syncCategoryQuotas();
      alert('Berhasil Sinkronkan Kuota Real-Time!');
      refreshDataFromServer();
    } catch (err: any) {
      alert(err?.message || 'Gagal menyinkronkan kuota. Periksa koneksi!');
    }
  };

  const handleSaveAllCategoriesQuota = async () => {
    try {
      await reorderCategories(categories);
      setQuotaSaveSuccess(true);
      setTimeout(() => setQuotaSaveSuccess(false), 3500);
    } catch (err: any) {
      alert(err?.message || 'Gagal menyimpan seluruh pengaturan kuota. Periksa koneksi!');
    }
  };

  const handleSaveCategoryQuota = async (catId: string) => {
    try {
      await reorderCategories(categories);
      setQuotaSaveSuccess(true);
      setTimeout(() => setQuotaSaveSuccess(false), 3000);
    } catch (err: any) {
      alert(err?.message || 'Gagal menyimpan pengaturan kuota. Periksa koneksi!');
    }
  };

  // Downloadable Docs Handlers
  const handleOpenAddDoc = () => {
    setEditingDoc(null);
    setDocForm({
      title: '',
      category: 'Formulir Pendaftaran',
      description: '',
      fileName: '',
      fileSize: '1.2 MB',
      fileUrl: '',
      fileType: 'PDF',
      isPrimary: false,
    });
    setDocFilePreview('');
    setDocFileSource('UPLOAD');
    setDocModalOpen(true);
  };

  const handleOpenEditDoc = (doc: DownloadableDoc) => {
    setEditingDoc(doc);
    setDocForm({
      title: doc.title,
      category: doc.category || 'Formulir Pendaftaran',
      description: doc.description || '',
      fileName: doc.fileName,
      fileSize: doc.fileSize,
      fileUrl: doc.fileUrl,
      fileType: doc.fileType,
      isPrimary: !!doc.isPrimary,
    });
    setDocFilePreview(doc.fileUrl);
    setDocFileSource(doc.fileUrl.startsWith('data:') ? 'UPLOAD' : 'URL');
    setDocModalOpen(true);
  };

  const handleDocFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 4 * 1024 * 1024) {
      alert('Ukuran file melebihi batas 4 MB. Untuk file PDF/dokumen di atas 4 MB, silakan kompres terlebih dahulu atau pilih opsi "Link URL / G-Drive".');
      return;
    }

    const sizeInMb = (file.size / (1024 * 1024)).toFixed(1) + ' MB';
    const extension = file.name.split('.').pop()?.toUpperCase() || 'PDF';
    let fType: 'PDF' | 'DOCX' | 'XLSX' | 'ZIP' | 'IMAGE' | 'OTHER' = 'PDF';
    if (extension === 'DOC' || extension === 'DOCX') fType = 'DOCX';
    else if (extension === 'XLS' || extension === 'XLSX') fType = 'XLSX';
    else if (extension === 'ZIP' || extension === 'RAR') fType = 'ZIP';
    else if (['PNG', 'JPG', 'JPEG', 'WEBP'].includes(extension)) fType = 'IMAGE';
    else if (extension === 'PDF') fType = 'PDF';
    else fType = 'OTHER';

    try {
      setDocUploading(true);
      setDocUploadProgress(20);

      // Unggah langsung file-by-file ke TiDB Cloud storage (app_media_storage)
      const uploadResult = await uploadToTiDbStorage(file, 'downloads', (pct) => {
        setDocUploadProgress(pct);
      });

      // Jika sebelumnya sedang edit dan ada berkas lama di TiDB media storage, hapus berkas lama
      if (editingDoc?.fileUrl && editingDoc.fileUrl.includes('/api/media/view/')) {
        deleteMediaFromStorage(editingDoc.fileUrl).catch(() => {});
      }

      setDocFilePreview(uploadResult.url);
      setDocForm(prev => ({
        ...prev,
        fileName: file.name,
        fileSize: uploadResult.size || sizeInMb,
        fileType: fType,
        fileUrl: uploadResult.url,
        title: prev.title || file.name.replace(/\.[^/.]+$/, ''),
      }));
    } catch (err: any) {
      console.error('Gagal upload berkas unduhan ke TiDB Cloud:', err);
      alert(err?.message || 'Gagal mengunggah berkas ke TiDB Cloud. Periksa koneksi atau coba kompres berkas.');
    } finally {
      setDocUploading(false);
      setDocUploadProgress(0);
    }
  };

  const handleSaveDoc = (e: React.FormEvent) => {
    e.preventDefault();
    if (docUploading) {
      alert('Mohon tunggu hingga proses unggah berkas ke TiDB Cloud selesai.');
      return;
    }
    if (!docForm.title.trim()) {
      alert('Mohon masukkan nama / judul berkas.');
      return;
    }
    const finalFileUrl = docFilePreview.trim() || docForm.fileUrl.trim() || '#';
    const finalFileName = docForm.fileName.trim() || `${docForm.title.replace(/\s+/g, '_')}.${docForm.fileType.toLowerCase()}`;

    if (editingDoc) {
      updateDownloadableDoc({
        ...editingDoc,
        title: docForm.title.trim(),
        category: docForm.category.trim(),
        description: docForm.description.trim(),
        fileName: finalFileName,
        fileSize: docForm.fileSize.trim() || '1.0 MB',
        fileUrl: finalFileUrl,
        fileType: docForm.fileType,
        isPrimary: docForm.isPrimary,
      });
    } else {
      addDownloadableDoc({
        title: docForm.title.trim(),
        category: docForm.category.trim(),
        description: docForm.description.trim(),
        fileName: finalFileName,
        fileSize: docForm.fileSize.trim() || '1.0 MB',
        fileUrl: finalFileUrl,
        fileType: docForm.fileType,
        isPrimary: docForm.isPrimary,
      });
    }
    setDocModalOpen(false);
  };

  // WhatsApp Contact Handlers
  const handleOpenAddContact = () => {
    setEditingContact(null);
    setContactForm({
      name: '',
      phone: '',
      role: 'Sekretariat Pendaftaran',
      isPrimary: committeeContacts.length === 0,
    });
    setContactModalOpen(true);
  };

  const handleOpenEditContact = (contact: CommitteeContact) => {
    setEditingContact(contact);
    setContactForm({
      name: contact.name,
      phone: contact.phone,
      role: contact.role,
      isPrimary: !!contact.isPrimary,
    });
    setContactModalOpen(true);
  };

  const handleSaveContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactForm.name.trim() || !contactForm.phone.trim()) {
      alert('Mohon lengkapi nama kontak dan nomor WhatsApp.');
      return;
    }
    if (editingContact) {
      updateCommitteeContact({
        ...editingContact,
        name: contactForm.name.trim(),
        phone: contactForm.phone.trim(),
        role: contactForm.role.trim() || 'Panitia Turnamen',
        isPrimary: contactForm.isPrimary,
      });
    } else {
      addCommitteeContact({
        name: contactForm.name.trim(),
        phone: contactForm.phone.trim(),
        role: contactForm.role.trim() || 'Panitia Turnamen',
        isPrimary: contactForm.isPrimary,
      });
    }
    setContactModalOpen(false);
  };

  // Email Handlers
  const handleOpenAddEmail = () => {
    setEditingEmail(null);
    setEmailForm({
      title: 'Sekretariat Utama',
      email: '',
      isPrimary: committeeEmails.length === 0,
    });
    setEmailModalOpen(true);
  };

  const handleOpenEditEmail = (item: CommitteeEmail) => {
    setEditingEmail(item);
    setEmailForm({
      title: item.title,
      email: item.email,
      isPrimary: !!item.isPrimary,
    });
    setEmailModalOpen(true);
  };

  const handleSaveEmail = (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailForm.email.trim()) {
      alert('Mohon masukkan alamat email resmi.');
      return;
    }
    if (editingEmail) {
      updateCommitteeEmail({
        ...editingEmail,
        title: emailForm.title.trim() || 'Sekretariat',
        email: emailForm.email.trim(),
        isPrimary: emailForm.isPrimary,
      });
    } else {
      addCommitteeEmail({
        title: emailForm.title.trim() || 'Sekretariat',
        email: emailForm.email.trim(),
        isPrimary: emailForm.isPrimary,
      });
    }
    setEmailModalOpen(false);
  };

  // Bank Account Handlers
  const handleOpenAddBank = () => {
    setEditingBank(null);
    setBankForm({
      bankName: 'Bank Nagari',
      accountNumber: '',
      accountHolder: 'PANITIA WABUPCUP 2026',
      branchName: 'Kantor Cabang Utama',
      instructions: 'Transfer ATM / Mobile Banking / Teller',
      isPrimary: bankAccounts.length === 0,
    });
    setBankModalOpen(true);
  };

  const handleOpenEditBank = (bank: CommitteeBankAccount) => {
    setEditingBank(bank);
    setBankForm({
      bankName: bank.bankName,
      accountNumber: bank.accountNumber,
      accountHolder: bank.accountHolder,
      branchName: bank.branchName || '',
      instructions: bank.instructions || '',
      isPrimary: !!bank.isPrimary,
    });
    setBankModalOpen(true);
  };

  const handleSaveBank = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bankForm.bankName.trim() || !bankForm.accountNumber.trim() || !bankForm.accountHolder.trim()) {
      alert('Mohon lengkapi Nama Bank, Nomor Rekening, dan Nama Pemilik Rekening.');
      return;
    }
    if (editingBank) {
      updateBankAccount({
        ...editingBank,
        bankName: bankForm.bankName.trim(),
        accountNumber: bankForm.accountNumber.trim(),
        accountHolder: bankForm.accountHolder.trim(),
        branchName: bankForm.branchName.trim() || undefined,
        instructions: bankForm.instructions.trim() || undefined,
        isPrimary: bankForm.isPrimary,
      });
    } else {
      addBankAccount({
        bankName: bankForm.bankName.trim(),
        accountNumber: bankForm.accountNumber.trim(),
        accountHolder: bankForm.accountHolder.trim(),
        branchName: bankForm.branchName.trim() || undefined,
        instructions: bankForm.instructions.trim() || undefined,
        isPrimary: bankForm.isPrimary,
      });
    }
    setBankModalOpen(false);
  };

  // General Config Handler
  const handleSaveGeneralConfig = (e: React.FormEvent) => {
    e.preventDefault();
    updateConfig({
      name: generalConfigForm.name.trim(),
      edition: generalConfigForm.edition.trim(),
      tagline: generalConfigForm.tagline.trim(),
      registrationDeadline: generalConfigForm.registrationDeadline.trim(),
      tournamentStartDate: generalConfigForm.tournamentStartDate.trim(),
      tournamentEndDate: generalConfigForm.tournamentEndDate.trim(),
      venueName: generalConfigForm.venueName.trim(),
      venueAddress: generalConfigForm.venueAddress.trim(),
      venueCity: generalConfigForm.venueCity.trim(),
      googleMapsEmbedUrl: generalConfigForm.googleMapsEmbedUrl.trim(),
      totalPrizePool: Number(generalConfigForm.totalPrizePool) || config.totalPrizePool,
      wabupLogoUrl: generalConfigForm.wabupLogoUrl.trim() || undefined,
      panitiaLogoUrl: generalConfigForm.panitiaLogoUrl.trim() || undefined,
    });
    setGeneralSaveSuccess(true);
    setTimeout(() => setGeneralSaveSuccess(false), 3000);
  };

  const handleWabupLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      alert('Ukuran file logo maksimal 10 MB.');
      return;
    }
    compressLogo(file, 400, 0.85)
      .then(dataUrl => {
        setGeneralConfigForm(prev => ({ ...prev, wabupLogoUrl: dataUrl }));
        updateConfig({ wabupLogoUrl: dataUrl });
      })
      .catch(() => {
        const reader = new FileReader();
        reader.onload = (event) => {
          const dataUrl = event.target?.result as string;
          setGeneralConfigForm(prev => ({ ...prev, wabupLogoUrl: dataUrl }));
          updateConfig({ wabupLogoUrl: dataUrl });
        };
        reader.readAsDataURL(file);
      });
  };

  const handlePanitiaLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      alert('Ukuran file logo maksimal 10 MB.');
      return;
    }
    compressLogo(file, 400, 0.85)
      .then(dataUrl => {
        setGeneralConfigForm(prev => ({ ...prev, panitiaLogoUrl: dataUrl }));
        updateConfig({ panitiaLogoUrl: dataUrl });
      })
      .catch(() => {
        const reader = new FileReader();
        reader.onload = (event) => {
          const dataUrl = event.target?.result as string;
          setGeneralConfigForm(prev => ({ ...prev, panitiaLogoUrl: dataUrl }));
          updateConfig({ panitiaLogoUrl: dataUrl });
        };
        reader.readAsDataURL(file);
      });
  };

  const handleRemoveWabupLogo = () => {
    setGeneralConfigForm(prev => ({ ...prev, wabupLogoUrl: '' }));
    updateConfig({ wabupLogoUrl: '' });
  };

  const handleRemovePanitiaLogo = () => {
    setGeneralConfigForm(prev => ({ ...prev, panitiaLogoUrl: '' }));
    updateConfig({ panitiaLogoUrl: '' });
  };

  // Section & Module Visibility Toggle Handler
  const handleToggleSectionVisibility = (key: keyof PageSectionsVisibility) => {
    const currentVis = config.sectionsVisibility || {
      hero: true,
      liveScore: true,
      categories: true,
      bracket: true,
      venue: true,
      sponsors: true,
      klasemenLanding: true,
      standaloneKlasemen: true,
      landingKlasemen: true,
      landingSchedule: true,
      landingBracket: true,
      landingTopScorer: true,
      standaloneTabKlasemen: true,
      standaloneTabJadwal: true,
      standaloneTabKnockout: true,
      standaloneTabTopScore: true,
      registrationButton: true,
    };
    const isCurrentlyVisible = (currentVis[key] ?? true) !== false;
    const nextVal = !isCurrentlyVisible;
    const updated: PageSectionsVisibility = {
      ...currentVis,
      [key]: nextVal,
    };
    if (key === 'landingKlasemen' || key === 'klasemenLanding') {
      updated.landingKlasemen = nextVal;
      updated.klasemenLanding = nextVal;
    }
    if (key === 'registrationButton') {
      const nextMode: RegistrationButtonMode = nextVal
        ? (config.registrationCustomLink?.trim() ? 'CUSTOM_LINK' : 'INTERNAL_FORM')
        : 'HIDDEN';
      setRegButtonMode(nextMode);
      updateConfig({
        sectionsVisibility: updated,
        registrationButtonMode: nextMode,
      });
      setVisibilitySaveSuccess(true);
      setTimeout(() => setVisibilitySaveSuccess(false), 2500);
      return;
    }
    updateConfig({ sectionsVisibility: updated });
    setVisibilitySaveSuccess(true);
    setTimeout(() => setVisibilitySaveSuccess(false), 2500);
  };

  // Preset 1-Click Visibility Scheme Handler
  const handleApplyVisibilityPreset = (preset: 'BOTH' | 'STANDALONE_ONLY' | 'LANDING_ONLY') => {
    const currentVis = config.sectionsVisibility || {
      hero: true,
      liveScore: true,
      categories: true,
      bracket: true,
      venue: true,
      sponsors: true,
      klasemenLanding: true,
      standaloneKlasemen: true,
      landingKlasemen: true,
      landingSchedule: true,
      landingBracket: true,
      landingTopScorer: true,
      standaloneTabKlasemen: true,
      standaloneTabJadwal: true,
      standaloneTabKnockout: true,
      standaloneTabTopScore: true,
      registrationButton: true,
    };

    let updated: PageSectionsVisibility;
    if (preset === 'BOTH') {
      updated = {
        ...currentVis,
        bracket: true,
        klasemenLanding: true,
        landingKlasemen: true,
        landingSchedule: true,
        landingBracket: true,
        landingTopScorer: true,
        standaloneKlasemen: true,
        standaloneTabKlasemen: true,
        standaloneTabJadwal: true,
        standaloneTabKnockout: true,
        standaloneTabTopScore: true,
      };
    } else if (preset === 'STANDALONE_ONLY') {
      updated = {
        ...currentVis,
        bracket: false,
        klasemenLanding: false,
        landingKlasemen: false,
        landingSchedule: false,
        landingBracket: false,
        landingTopScorer: false,
        standaloneKlasemen: true,
        standaloneTabKlasemen: true,
        standaloneTabJadwal: true,
        standaloneTabKnockout: true,
        standaloneTabTopScore: true,
      };
    } else {
      // LANDING_ONLY
      updated = {
        ...currentVis,
        bracket: true,
        klasemenLanding: true,
        landingKlasemen: true,
        landingSchedule: true,
        landingBracket: true,
        landingTopScorer: true,
        standaloneKlasemen: false,
      };
    }
    updateConfig({ sectionsVisibility: updated });
    setVisibilitySaveSuccess(true);
    setTimeout(() => setVisibilitySaveSuccess(false), 2500);
  };

  // Category CRUD Handlers
  const handleOpenAddCategory = () => {
    setEditingCategory(null);
    setCategoryForm({
      id: '',
      name: '',
      ageRestriction: '',
      description: '',
      maxTeams: 16,
      registrationFee: 500000,
      totalPrize: 10000000,
      prizes: [
        { rank: 'Juara 1', prizeMoney: 5000000, trophy: 'Piala Bergilir + Medali Emas' },
        { rank: 'Juara 2', prizeMoney: 3000000, trophy: 'Piala Tetap + Medali Perak' },
        { rank: 'Juara 3 Bersama', prizeMoney: 1500000, trophy: 'Piala Tetap + Medali Perunggu' },
      ],
      rules: [
        'Wajib melampirkan berkas dokumen persyaratan resmi PDF.',
        'Pemain dan official wajib mematuhi seluruh regulasi turnamen.',
      ],
    });
    setCategoryModalOpen(true);
  };

  const handleOpenEditCategory = (c: CategoryDetail) => {
    setEditingCategory(c);
    setCategoryForm({
      id: c.id,
      name: c.name,
      ageRestriction: c.ageRestriction,
      description: c.description || '',
      maxTeams: c.maxTeams,
      registrationFee: c.registrationFee,
      totalPrize: c.totalPrize,
      prizes: c.prizes && c.prizes.length > 0 ? JSON.parse(JSON.stringify(c.prizes)) : [
        { rank: 'Juara 1', prizeMoney: c.totalPrize * 0.5, trophy: 'Trofi + Medali' }
      ],
      rules: c.rules && c.rules.length > 0 ? [...c.rules] : [
        'Wajib melampirkan berkas dokumen resmi PDF.'
      ],
    });
    setCategoryModalOpen(true);
  };

  const handleSaveCategoryModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryForm.name.trim()) {
      alert('Mohon masukkan nama kategori turnamen.');
      return;
    }
    const catId = editingCategory
      ? editingCategory.id
      : (categoryForm.id.trim().toUpperCase().replace(/\s+/g, '_') || categoryForm.name.trim().toUpperCase().replace(/\s+/g, '_'));

    const updatedCat: CategoryDetail = {
      id: catId,
      name: categoryForm.name.trim(),
      badgeTitle: categoryForm.name.trim(),
      ageRestriction: categoryForm.ageRestriction.trim() || 'Semua Usia',
      description: categoryForm.description.trim() || undefined,
      maxTeams: Math.max(1, Number(categoryForm.maxTeams) || 16),
      registrationFee: Number(categoryForm.registrationFee) || 0,
      totalPrize: Number(categoryForm.totalPrize) || 0,
      prizes: categoryForm.prizes.map(p => ({
        rank: p.rank,
        prizeMoney: p.prizeMoney,
        trophyText: p.trophy || p.trophyText || 'Piala & Piagam',
        trophy: p.trophy || p.trophyText || 'Piala & Piagam',
      })),
      rules: categoryForm.rules,
      registeredTeamsCount: editingCategory ? editingCategory.registeredTeamsCount : 0,
    };

    if (editingCategory) {
      updateCategory(updatedCat);
    } else {
      addCategory(updatedCat);
    }
    setCategoryModalOpen(false);
  };

  const handleDeleteCategoryPrompt = (id: string, name: string) => {
    if (confirm(`Apakah Anda yakin ingin menghapus kategori "${name}" (${id})?\n\nKategori ini akan dihapus dari sistem, form pendaftaran, dan landing page.`)) {
      deleteCategory(id);
    }
  };

  // Search and filters for registration tables
  const [searchFilter, setSearchFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');

  // PDF Viewer Modal State
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<UploadedDoc | null>(null);
  const [selectedDocTitle, setSelectedDocTitle] = useState('');
  const [selectedTeamName, setSelectedTeamName] = useState('');

  // Rejection reason prompt modal state
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [targetRejectItem, setTargetRejectItem] = useState<RegistrationItem | null>(null);
  const [rejectionReasonText, setRejectionReasonText] = useState('');

  // Document Inspector Modal State
  const [inspectDocsItem, setInspectDocsItem] = useState<RegistrationItem | null>(null);

  // Super Admin Full Registration Editor Modal State
  const [editRegModalOpen, setEditRegModalOpen] = useState(false);
  const [editingReg, setEditingReg] = useState<RegistrationItem | null>(null);
  const [regForm, setRegForm] = useState<{
    teamName: string;
    category: TournamentCategory;
    institutionName: string;
    coachName: string;
    coachPhone: string;
    coachEmail: string;
    playerCount: number;
    officialCount: number;
    paymentAmount: number;
    paymentStatus: PaymentStatus;
    status: RegistrationStatus;
    rejectionReason: string;
    adminNotes: string;
    teamLogo: string;
    suratKeterangan: UploadedDoc | undefined;
    suratPernyataan: UploadedDoc | undefined;
    formulirPemain: UploadedDoc | undefined;
    aktaKelahiran: UploadedDoc | undefined;
    raportKartuPelajar: UploadedDoc | undefined;
    ktpGabungan: UploadedDoc | undefined;
    bpjsKetenagakerjaan: UploadedDoc | undefined;
    buktiPembayaran: UploadedDoc | undefined;
    logoTim: UploadedDoc | undefined;
  }>({
    teamName: '',
    category: 'SMA',
    institutionName: '',
    coachName: '',
    coachPhone: '',
    coachEmail: '',
    playerCount: 12,
    officialCount: 2,
    paymentAmount: 350000,
    paymentStatus: 'UNPAID',
    status: 'PENDING_PAYMENT',
    rejectionReason: '',
    adminNotes: '',
    teamLogo: '',
    suratKeterangan: undefined,
    suratPernyataan: undefined,
    formulirPemain: undefined,
    aktaKelahiran: undefined,
    raportKartuPelajar: undefined,
    ktpGabungan: undefined,
    bpjsKetenagakerjaan: undefined,
    buktiPembayaran: undefined,
    logoTim: undefined,
  });
  const [uploadingDocs, setUploadingDocs] = useState<Record<string, boolean>>({});
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const handleOpenEditReg = (item: RegistrationItem) => {
    setEditingReg(item);
    setUploadingDocs({});
    setUploadingLogo(false);
    setRegForm({
      teamName: item.teamName,
      category: item.category,
      institutionName: item.institutionName,
      coachName: item.coachName,
      coachPhone: item.coachPhone,
      coachEmail: item.coachEmail || '',
      playerCount: item.playerCount || 12,
      officialCount: item.officialCount || 2,
      paymentAmount: item.paymentAmount,
      paymentStatus: item.paymentStatus,
      status: item.status,
      rejectionReason: item.rejectionReason || '',
      adminNotes: item.adminNotes || '',
      teamLogo: item.teamLogo || '',
      suratKeterangan: item.documents?.suratKeterangan,
      suratPernyataan: item.documents?.suratPernyataan,
      formulirPemain: item.documents?.formulirPemain,
      aktaKelahiran: item.documents?.aktaKelahiran,
      raportKartuPelajar: item.documents?.raportKartuPelajar,
      ktpGabungan: item.documents?.ktpGabungan,
      bpjsKetenagakerjaan: item.documents?.bpjsKetenagakerjaan,
      buktiPembayaran: item.documents?.buktiPembayaran,
      logoTim: item.documents?.logoTim,
    });
    setEditRegModalOpen(true);
  };

  const handleSaveEditReg = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingReg) return;

    // Prune removed documents and ensure clean document object
    const cleanDocs: Record<string, UploadedDoc> = {};
    if (editingReg.documents) {
      Object.entries(editingReg.documents).forEach(([k, v]) => {
        if (v && (v as any).name) cleanDocs[k] = v as UploadedDoc;
      });
    }

    const docKeys = [
      'suratKeterangan',
      'suratPernyataan',
      'formulirPemain',
      'aktaKelahiran',
      'raportKartuPelajar',
      'ktpGabungan',
      'bpjsKetenagakerjaan',
      'buktiPembayaran',
      'logoTim',
    ];

    for (const k of docKeys) {
      const val = (regForm as any)[k];
      if (val && val.name) {
        cleanDocs[k] = val;
      } else {
        delete cleanDocs[k];
      }
    }

    let formattedLogo = regForm.teamLogo.trim();
    if (formattedLogo.includes('/api/media/view/')) {
      formattedLogo = formattedLogo.substring(formattedLogo.indexOf('/api/media/view/'));
    } else if (/^med-\d+-[a-zA-Z0-9_-]+$/i.test(formattedLogo)) {
      formattedLogo = `/api/media/view/${formattedLogo}`;
    }

    const updated: RegistrationItem = {
      ...editingReg,
      teamName: regForm.teamName.trim(),
      category: regForm.category,
      institutionName: regForm.institutionName.trim(),
      coachName: regForm.coachName.trim(),
      coachPhone: regForm.coachPhone.trim(),
      coachEmail: regForm.coachEmail.trim() || '',
      playerCount: Number(regForm.playerCount) || 12,
      officialCount: Number(regForm.officialCount) || 2,
      paymentAmount: Number(regForm.paymentAmount) || editingReg.paymentAmount,
      paymentStatus: regForm.paymentStatus,
      status: regForm.status,
      rejectionReason: regForm.rejectionReason.trim() || undefined,
      adminNotes: regForm.adminNotes.trim() || undefined,
      teamLogo: formattedLogo || undefined,
      documents: cleanDocs,
      lastUpdated: new Date().toISOString(),
    };
    updateRegistration(updated);
    setEditRegModalOpen(false);
    setEditingReg(null);
  };

  const handleRegTeamLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      alert('Ukuran logo maksimal 10 MB.');
      return;
    }

    setUploadingLogo(true);
    const oldLogoUrl = regForm.teamLogo;

    try {
      // 1. Upload new logo to TiDB Cloud media storage directly
      const res = await uploadToTiDbStorage(file, 'logos', undefined, editingReg?.id, 'teamLogo');

      // 2. Cascading delete: if previous logo was in storage, delete it immediately from storage
      if (oldLogoUrl && oldLogoUrl.includes('/api/media/view/') && oldLogoUrl !== res.url) {
        deleteMediaFromStorage(oldLogoUrl).catch(err =>
          console.warn('Gagal menghapus logo lama dari TiDB Cloud:', err)
        );
      }

      setRegForm(prev => ({ ...prev, teamLogo: res.url }));
    } catch (err) {
      console.warn('Upload logo ke cloud gagal, menggunakan fallback kompresi:', err);
      compressLogo(file, 400, 0.85)
        .then(dataUrl => {
          setRegForm(prev => ({ ...prev, teamLogo: dataUrl }));
        })
        .catch(() => {
          const reader = new FileReader();
          reader.onload = (evt) => {
            const dataUrl = evt.target?.result as string;
            setRegForm(prev => ({ ...prev, teamLogo: dataUrl }));
          };
          reader.readAsDataURL(file);
        });
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleRemoveRegLogo = () => {
    if (regForm.teamLogo && regForm.teamLogo.includes('/api/media/view/')) {
      deleteMediaFromStorage(regForm.teamLogo).catch(err =>
        console.warn('Gagal menghapus logo dari TiDB Cloud:', err)
      );
    }
    setRegForm(prev => ({ ...prev, teamLogo: '' }));
  };

  const handleRegDocUpload = async (
    docType: keyof typeof regForm,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1) + ' MB';
    const docKeyStr = String(docType);

    setUploadingDocs(prev => ({ ...prev, [docKeyStr]: true }));

    // Find previous document to delete its media file from storage upon replacement
    const currentDoc = regForm[docType] as UploadedDoc | undefined;
    const oldUrl = currentDoc?.url || (currentDoc?.fileData && currentDoc.fileData.includes('/api/media/view/') ? currentDoc.fileData : undefined);

    try {
      // 1. Upload new document directly to TiDB Cloud media storage
      const res = await uploadToTiDbStorage(file, 'registrations', undefined, editingReg?.id, docKeyStr);

      // 2. Cascading delete: if old file was in TiDB Cloud storage, delete it immediately
      if (oldUrl && oldUrl !== res.url) {
        deleteMediaFromStorage(oldUrl).catch(err =>
          console.warn('Gagal menghapus berkas lama dari TiDB Cloud:', err)
        );
      }

      const uploadedDoc: UploadedDoc = {
        name: file.name,
        size: sizeMb,
        url: res.url,
        fileData: res.url,
        uploadDate: new Date().toISOString().split('T')[0],
        type: file.type || 'application/pdf',
      };
      setRegForm(prev => ({ ...prev, [docType]: uploadedDoc }));
    } catch (err: any) {
      console.warn('Upload berkas ke cloud gagal, menggunakan fallback lokal:', err);
      const reader = new FileReader();
      reader.onload = (evt) => {
        const dataUrl = evt.target?.result as string;
        const uploadedDoc: UploadedDoc = {
          name: file.name,
          size: sizeMb,
          fileData: dataUrl,
          uploadDate: new Date().toISOString().split('T')[0],
          type: file.type || 'application/pdf',
        };
        setRegForm(prev => ({ ...prev, [docType]: uploadedDoc }));
      };
      reader.readAsDataURL(file);
    } finally {
      setUploadingDocs(prev => ({ ...prev, [docKeyStr]: false }));
    }
  };

  const handleRemoveRegDoc = (docType: keyof typeof regForm) => {
    const currentDoc = regForm[docType] as UploadedDoc | undefined;
    const oldUrl = currentDoc?.url || (currentDoc?.fileData && currentDoc.fileData.includes('/api/media/view/') ? currentDoc.fileData : undefined);
    if (oldUrl) {
      deleteMediaFromStorage(oldUrl).catch(err =>
        console.warn('Gagal menghapus berkas dari TiDB Cloud:', err)
      );
    }
    setRegForm(prev => ({ ...prev, [docType]: undefined }));
  };

  // Drawing Randomizer State
  const [drawCategory, setDrawCategory] = useState<TournamentCategory>('SMA');
  const [drawStageOption, setDrawStageOption] = useState<'AUTO' | 'PENYISIHAN' | '16_BESAR' | '8_BESAR' | 'SEMIFINAL'>('AUTO');
  const [drawResultMatches, setDrawResultMatches] = useState<MatchItem[] | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // Live Score & Match Editor State
  const [editMatchModalOpen, setEditMatchModalOpen] = useState(false);
  const [editingMatch, setEditingMatch] = useState<MatchItem | null>(null);
  const [matchForm, setMatchForm] = useState<{
    id: string;
    matchNumber: number;
    category: TournamentCategory;
    round: string;
    roundIndex: number;
    teamAName: string;
    teamAInstitution: string;
    teamALogo: string;
    teamAScore: number;
    teamAPenalties: string;
    teamBName: string;
    teamBInstitution: string;
    teamBLogo: string;
    teamBScore: number;
    teamBPenalties: string;
    date: string;
    time: string;
    pitch: string;
    status: MatchStatus;
    liveMinute: string;
    winnerId: 'A' | 'B' | 'DRAW';
  }>({
    id: '',
    matchNumber: 1,
    category: 'SMA',
    round: 'Babak Penyisihan',
    roundIndex: 2,
    teamAName: '',
    teamAInstitution: '',
    teamALogo: '',
    teamAScore: 0,
    teamAPenalties: '',
    teamBName: '',
    teamBInstitution: '',
    teamBLogo: '',
    teamBScore: 0,
    teamBPenalties: '',
    date: '2026-10-25',
    time: '14:00',
    pitch: config.venueName || 'Gedung Utama GOR Tawang Alun Banyuwangi',
    status: 'UPCOMING',
    liveMinute: '45\'',
    winnerId: 'DRAW',
  });

  const handleOpenAddMatch = (defaultCat?: string) => {
    const chosenCategory = (defaultCat && defaultCat !== 'ALL' ? defaultCat : (categories[0]?.id || 'SMA')) as TournamentCategory;
    const defaultPitch = config.venueName || 'Gedung Utama GOR Tawang Alun Banyuwangi';
    const newPlaceholder: MatchItem = {
      id: `match-${Date.now()}`,
      matchNumber: matches.length + 1,
      category: chosenCategory,
      round: 'Babak Penyisihan',
      roundIndex: 2,
      teamA: { name: '' },
      teamB: { name: '' },
      date: '2026-10-25',
      time: '14:00',
      pitch: defaultPitch,
      status: 'UPCOMING',
    };
    setEditingMatch(newPlaceholder);
    setMatchForm({
      id: newPlaceholder.id,
      matchNumber: newPlaceholder.matchNumber,
      category: chosenCategory,
      round: 'Babak Penyisihan',
      roundIndex: 2,
      teamAName: '',
      teamAInstitution: '',
      teamALogo: '',
      teamAScore: 0,
      teamAPenalties: '',
      teamBName: '',
      teamBInstitution: '',
      teamBLogo: '',
      teamBScore: 0,
      teamBPenalties: '',
      date: '2026-10-25',
      time: '14:00',
      pitch: defaultPitch,
      status: 'UPCOMING',
      liveMinute: '0\'',
      winnerId: 'DRAW',
    });
    setEditMatchModalOpen(true);
  };

  const handleOpenEditMatch = (m: MatchItem) => {
    setEditingMatch(m);
    const pA = m.teamA.penalties !== undefined ? String(m.teamA.penalties) : '';
    const pB = m.teamB.penalties !== undefined ? String(m.teamB.penalties) : '';
    let win: 'A' | 'B' | 'DRAW' = 'DRAW';
    if (m.winnerId === 'A' || (m.teamA.score ?? 0) > (m.teamB.score ?? 0)) win = 'A';
    else if (m.winnerId === 'B' || (m.teamB.score ?? 0) > (m.teamA.score ?? 0)) win = 'B';

    setMatchForm({
      id: m.id,
      matchNumber: m.matchNumber,
      category: m.category,
      round: m.round,
      roundIndex: m.roundIndex || 2,
      teamAName: m.teamA.name,
      teamAInstitution: m.teamA.institution || '',
      teamALogo: m.teamA.logo || '',
      teamAScore: m.teamA.score ?? 0,
      teamAPenalties: pA,
      teamBName: m.teamB.name,
      teamBInstitution: m.teamB.institution || '',
      teamBLogo: m.teamB.logo || '',
      teamBScore: m.teamB.score ?? 0,
      teamBPenalties: pB,
      date: m.date,
      time: m.time,
      pitch: m.pitch,
      status: m.status,
      liveMinute: m.liveMinute || '45\'',
      winnerId: win,
    });
    setEditMatchModalOpen(true);
  };

  const handleSaveEditMatch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMatch) return;
    const penA = matchForm.teamAPenalties !== '' ? Number(matchForm.teamAPenalties) : undefined;
    const penB = matchForm.teamBPenalties !== '' ? Number(matchForm.teamBPenalties) : undefined;

    let finalWinnerId: 'A' | 'B' | undefined = undefined;
    if (matchForm.winnerId === 'A') finalWinnerId = 'A';
    else if (matchForm.winnerId === 'B') finalWinnerId = 'B';
    else if (matchForm.status === 'FINISHED') {
      if (matchForm.teamAScore > matchForm.teamBScore) finalWinnerId = 'A';
      else if (matchForm.teamBScore > matchForm.teamAScore) finalWinnerId = 'B';
      else if (penA !== undefined && penB !== undefined) {
        if (penA > penB) finalWinnerId = 'A';
        else if (penB > penA) finalWinnerId = 'B';
      }
    }

    const updated: MatchItem = {
      ...editingMatch,
      matchNumber: Number(matchForm.matchNumber) || editingMatch.matchNumber,
      category: matchForm.category,
      round: matchForm.round.trim() || 'Babak Penyisihan',
      roundIndex: Number(matchForm.roundIndex) || editingMatch.roundIndex || 2,
      teamA: {
        ...editingMatch.teamA,
        name: matchForm.teamAName.trim() || 'Tim A',
        institution: matchForm.teamAInstitution.trim() || undefined,
        logo: matchForm.teamALogo.trim() || undefined,
        score: Number(matchForm.teamAScore) || 0,
        penalties: penA,
      },
      teamB: {
        ...editingMatch.teamB,
        name: matchForm.teamBName.trim() || 'Tim B',
        institution: matchForm.teamBInstitution.trim() || undefined,
        logo: matchForm.teamBLogo.trim() || undefined,
        score: Number(matchForm.teamBScore) || 0,
        penalties: penB,
      },
      date: matchForm.date.trim() || '2026-10-25',
      time: matchForm.time.trim() || '14:00',
      pitch: matchForm.pitch.trim() || config.venueName || 'Gedung Utama GOR Tawang Alun Banyuwangi',
      status: matchForm.status,
      liveMinute: matchForm.liveMinute.trim() || undefined,
      winnerId: finalWinnerId,
    };

    const exists = matches.some(m => m.id === editingMatch.id);
    if (exists) {
      updateMatch(updated);
    } else {
      addMatch(updated);
    }
    setEditMatchModalOpen(false);
    setEditingMatch(null);
  };

  // Sponsor form modal state
  const [sponsorModalOpen, setSponsorModalOpen] = useState(false);
  const [editingSponsor, setEditingSponsor] = useState<SponsorItem | null>(null);
  const [sponsorForm, setSponsorForm] = useState<{
    name: string;
    tier: SponsorTier;
    logoText: string;
    logoUrl: string;
    websiteUrl: string;
    description: string;
  }>({
    name: '',
    tier: 'GOLD',
    logoText: '',
    logoUrl: '',
    websiteUrl: '',
    description: '',
  });
  const [sponsorLogoPreview, setSponsorLogoPreview] = useState<string>('');
  const [sponsorLogoType, setSponsorLogoType] = useState<'UPLOAD' | 'URL'>('UPLOAD');

  // Admin User modal state
  const [adminUserModalOpen, setAdminUserModalOpen] = useState(false);
  const [adminUserForm, setAdminUserForm] = useState<{ username: string; fullName: string; role: AdminRole; email: string; phone: string }>({
    username: '',
    fullName: '',
    role: 'PANITIA',
    email: '',
    phone: '',
  });

  // GAS export active sub-tab
  const [gasActiveFile, setGasActiveFile] = useState<'setup.gs' | 'Code.gs' | 'Index.html' | 'Panduan_Deploy'>('setup.gs');
  const [copiedGas, setCopiedGas] = useState(false);

  // AUTH SUBMISSION (ASYNC REAL DB / PERSISTED USERS)
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setIsLoggingIn(true);
    try {
      const res = await loginAdmin(username, password);
      if (!res.success) {
        const errorMsg = res.message || 'Username atau password salah! Periksa kembali akun Anda.';
        setLoginError(errorMsg);
        alert(errorMsg);
      } else if (res.admin && (res.admin.role === 'WASIT' || res.admin.role === 'OPERATOR')) {
        setActiveTab('SCHEDULE_LIVESCORE');
      }
    } catch (err: any) {
      const errorMsg = err.message || 'Gagal login. Periksa koneksi jaringan atau database.';
      setLoginError(errorMsg);
      alert(errorMsg);
    } finally {
      setIsLoggingIn(false);
    }
  };

  // OPEN PDF VIEWER
  const handleOpenPdf = (doc: UploadedDoc | undefined, title: string, team: string) => {
    if (!doc) {
      alert('Dokumen ini belum diunggah oleh peserta.');
      return;
    }
    setSelectedDoc(doc);
    setSelectedDocTitle(title);
    setSelectedTeamName(team);
    setPdfModalOpen(true);
  };

  // DOCUMENT LABELS & REQUIREMENTS HELPERS
  const getRequiredDocsForCategory = (category: TournamentCategory): { key: string; label: string; shortLabel: string }[] => {
    switch (category) {
      case 'SD':
        return [
          { key: 'suratKeterangan', label: 'Surat Keterangan Sekolah', shortLabel: 'Surat Sekolah' },
          { key: 'suratPernyataan', label: 'Surat Pernyataan SPTJM Bermaterai', shortLabel: 'SPTJM' },
          { key: 'formulirPemain', label: 'Formulir Pemain & Official', shortLabel: 'Form Pemain' },
          { key: 'aktaKelahiran', label: 'Akta Kelahiran Gabungan (Max 2014)', shortLabel: 'Akta SD' },
          { key: 'raportKartuPelajar', label: 'Raport / Kartu Pelajar Siswa', shortLabel: 'Raport/Kartu' },
        ];
      case 'SMP':
      case 'SMA':
        return [
          { key: 'suratKeterangan', label: 'Surat Izin / Keterangan Sekolah', shortLabel: 'Surat Sekolah' },
          { key: 'suratPernyataan', label: 'Surat Pernyataan SPTJM Bermaterai', shortLabel: 'SPTJM' },
          { key: 'formulirPemain', label: 'Formulir Pemain & Official', shortLabel: 'Form Pemain' },
          { key: 'raportKartuPelajar', label: 'Raport Terakhir / Kartu Pelajar', shortLabel: 'Raport/Kartu' },
        ];
      case 'INSTANSI':
        return [
          { key: 'suratKeterangan', label: 'Surat Tugas / Keterangan Pimpinan Instansi', shortLabel: 'Surat Instansi' },
          { key: 'suratPernyataan', label: 'Surat Pernyataan Tanggung Jawab', shortLabel: 'SPTJM' },
          { key: 'formulirPemain', label: 'Formulir Pemain Karyawan & Official', shortLabel: 'Form Karyawan' },
          { key: 'bpjsKetenagakerjaan', label: 'File BPJS Ketenagakerjaan / ID Card', shortLabel: 'BPJS Ketenagakerjaan' },
        ];
      case 'DESA':
        return [
          { key: 'suratKeterangan', label: 'Surat Keterangan Domisili Kepala Desa / Lurah', shortLabel: 'Surat Kades' },
          { key: 'suratPernyataan', label: 'Surat Pernyataan Tanggung Jawab', shortLabel: 'SPTJM' },
          { key: 'formulirPemain', label: 'Formulir Pemain & Official', shortLabel: 'Form Pemain' },
          { key: 'ktpGabungan', label: 'File KTP / KK Asli Pemain & Official', shortLabel: 'KTP Gabungan' },
        ];
      case 'UMUM':
        return [
          { key: 'suratPernyataan', label: 'Surat Pernyataan Tanggung Jawab', shortLabel: 'SPTJM' },
          { key: 'formulirPemain', label: 'Formulir Pemain & Official', shortLabel: 'Form Pemain' },
          { key: 'ktpGabungan', label: 'File KTP Asli Pemain & Official', shortLabel: 'KTP Gabungan' },
        ];
      default:
        return [
          { key: 'suratKeterangan', label: 'Surat Keterangan', shortLabel: 'Surat Ket' },
          { key: 'suratPernyataan', label: 'Surat Pernyataan', shortLabel: 'SPTJM' },
          { key: 'formulirPemain', label: 'Formulir Pemain', shortLabel: 'Form Pemain' },
        ];
    }
  };

  const getDocDisplayInfo = (key: string, category: TournamentCategory) => {
    switch (key) {
      case 'suratKeterangan':
        if (category === 'SD' || category === 'SMP' || category === 'SMA') {
          return { title: 'Surat Keterangan / Izin Sekolah', label: 'Surat Sekolah', color: 'bg-blue-950/80 text-blue-300 border-blue-800/60 hover:bg-blue-900' };
        }
        if (category === 'INSTANSI') {
          return { title: 'Surat Tugas Instansi / Pimpinan', label: 'Surat Instansi', color: 'bg-emerald-950/80 text-emerald-300 border-emerald-800/60 hover:bg-emerald-900' };
        }
        if (category === 'DESA') {
          return { title: 'Surat Keterangan Kepala Desa / Lurah', label: 'Surat Kades', color: 'bg-amber-950/80 text-amber-300 border-amber-800/60 hover:bg-amber-900' };
        }
        if (category === 'UMUM') {
          return { title: 'Surat Rekomendasi / Pengantar Klub', label: 'Surat Klub', color: 'bg-indigo-950/80 text-indigo-300 border-indigo-800/60 hover:bg-indigo-900' };
        }
        return { title: 'Surat Keterangan', label: 'Surat Ket', color: 'bg-blue-950/80 text-blue-300 border-blue-800/60 hover:bg-blue-900' };
      case 'suratPernyataan':
        return { title: 'Surat Pernyataan Bermaterai (SPTJM)', label: 'Pernyataan SPTJM', color: 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700' };
      case 'formulirPemain':
        return { title: 'Formulir Susunan Pemain & Official', label: 'Form Pemain', color: 'bg-indigo-950/80 text-indigo-300 border-indigo-800/60 hover:bg-indigo-900' };
      case 'aktaKelahiran':
        return { title: 'Akta Kelahiran Gabungan (Maks Kelahiran 2014)', label: 'Akta SD', color: 'bg-red-950/80 text-red-300 border-red-800/60 hover:bg-red-900' };
      case 'raportKartuPelajar':
        return { title: 'Raport Terakhir / Kartu Pelajar (PDF)', label: 'Raport/Kartu', color: 'bg-cyan-950/80 text-cyan-300 border-cyan-800/60 hover:bg-cyan-900' };
      case 'ktpGabungan':
        return { title: 'File KTP Pemain & Official Gabungan (PDF)', label: 'KTP Gabungan', color: 'bg-amber-950/80 text-amber-300 border-amber-800/60 hover:bg-amber-900' };
      case 'bpjsKetenagakerjaan':
        return { title: 'File BPJS Ketenagakerjaan / ID Card Pegawai (PDF)', label: 'BPJS Ketenagakerjaan', color: 'bg-teal-950/80 text-teal-300 border-teal-800/60 hover:bg-teal-900' };
      case 'buktiPembayaran':
        return { title: 'Bukti Pembayaran / Transfer Bank', label: 'Bukti Transfer', color: 'bg-emerald-950/80 text-emerald-300 border-emerald-800/60 hover:bg-emerald-900' };
      case 'logoTim':
        return { title: 'Logo Resmi Tim / Klub', label: 'Logo Tim', color: 'bg-violet-950/80 text-violet-300 border-violet-800/60 hover:bg-violet-900' };
      default:
        return { title: key, label: key, color: 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700' };
    }
  };

  // OPEN REJECT MODAL
  const handleOpenReject = (item: RegistrationItem) => {
    setTargetRejectItem(item);
    setRejectionReasonText(item.rejectionReason || '');
    setRejectModalOpen(true);
  };

  const handleConfirmReject = () => {
    if (targetRejectItem) {
      updateRegistrationStatus(
        targetRejectItem.id,
        'REJECTED',
        rejectionReasonText.trim() || 'Dokumen persyaratan belum lengkap/tidak valid.'
      );
      setRejectModalOpen(false);
      setTargetRejectItem(null);
    }
  };

  // EXECUTE RANDOM DRAWING
  const handleRunDrawing = () => {
    setIsDrawing(true);
    setTimeout(() => {
      const result = randomizeMatchesForCategory(drawCategory, drawStageOption);
      if (!result.success) {
        alert(result.message);
        setDrawResultMatches(null);
      } else if (result.matches) {
        setDrawResultMatches(result.matches);
      }
      setIsDrawing(false);
    }, 600);
  };

  // COPY GAS CODE
  const handleCopyGasCode = () => {
    let text = '';
    if (gasActiveFile === 'setup.gs') text = SETUP_GS_CODE;
    else if (gasActiveFile === 'Code.gs') text = CODE_GS_CODE;
    else if (gasActiveFile === 'Index.html') text = INDEX_HTML_STANDALONE_TEMPLATE;
    else if (gasActiveFile === 'Panduan_Deploy') text = DEPLOYMENT_AND_GIT_GUIDE;

    navigator.clipboard.writeText(text);
    setCopiedGas(true);
    setTimeout(() => setCopiedGas(false), 2500);
  };

  // DOWNLOAD GAS FILE
  const handleDownloadGasFile = () => {
    let content = '';
    let filename = '';
    if (gasActiveFile === 'setup.gs') { content = SETUP_GS_CODE; filename = 'setup.gs'; }
    else if (gasActiveFile === 'Code.gs') { content = CODE_GS_CODE; filename = 'Code.gs'; }
    else if (gasActiveFile === 'Index.html') { content = INDEX_HTML_STANDALONE_TEMPLATE; filename = 'Index.html'; }
    else { content = DEPLOYMENT_AND_GIT_GUIDE; filename = 'PANDUAN_DEPLOYMENT.md'; }

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  // SPONSOR MANAGEMENT ACTIONS
  const handleOpenAddSponsor = () => {
    setEditingSponsor(null);
    setSponsorForm({
      name: '',
      tier: 'GOLD',
      logoText: '',
      logoUrl: '',
      websiteUrl: '',
      description: '',
    });
    setSponsorLogoPreview('');
    setSponsorLogoType('UPLOAD');
    setSponsorModalOpen(true);
  };

  const handleOpenEditSponsor = (sp: SponsorItem) => {
    setEditingSponsor(sp);
    setSponsorForm({
      name: sp.name,
      tier: sp.tier,
      logoText: sp.logoText || '',
      logoUrl: sp.logoUrl || '',
      websiteUrl: sp.websiteUrl || '',
      description: sp.description || '',
    });
    setSponsorLogoPreview(sp.logoUrl || '');
    setSponsorLogoType(sp.logoUrl?.startsWith('data:') ? 'UPLOAD' : sp.logoUrl ? 'URL' : 'UPLOAD');
    setSponsorModalOpen(true);
  };

  const handleSponsorFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      alert('Ukuran file logo terlalu besar. Maksimal 10 MB.');
      return;
    }

    uploadToTiDbStorage(file, 'sponsors')
      .then(res => {
        // If editing and previous logo is in TiDB, we clean up the previous file when replaced
        if (editingSponsor?.logoUrl && editingSponsor.logoUrl !== res.url && editingSponsor.logoUrl.includes('/api/media/view/')) {
          deleteMediaFromStorage(editingSponsor.logoUrl).catch(() => {});
        }
        setSponsorLogoPreview(res.url);
        setSponsorForm(prev => ({ ...prev, logoUrl: res.url }));
      })
      .catch(() => {
        compressLogo(file, 400, 0.85)
          .then(dataUrl => {
            setSponsorLogoPreview(dataUrl);
            setSponsorForm(prev => ({ ...prev, logoUrl: dataUrl }));
          })
          .catch(() => {
            const reader = new FileReader();
            reader.onload = (event) => {
              const dataUrl = event.target?.result as string;
              setSponsorLogoPreview(dataUrl);
              setSponsorForm(prev => ({ ...prev, logoUrl: dataUrl }));
            };
            reader.readAsDataURL(file);
          });
      });
  };

  const handleSaveSponsor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sponsorForm.name.trim()) {
      alert('Mohon masukkan nama sponsor / perusahaan.');
      return;
    }

    const finalLogoText = sponsorForm.logoText.trim() || sponsorForm.name.slice(0, 4).toUpperCase();
    const finalLogoUrl = sponsorLogoPreview.trim() || sponsorForm.logoUrl.trim() || undefined;

    const rawWebUrl = sponsorForm.websiteUrl.trim();
    let finalWebsiteUrl: string | undefined = undefined;
    if (rawWebUrl) {
      if (rawWebUrl.startsWith('@')) {
        finalWebsiteUrl = `https://instagram.com/${rawWebUrl.slice(1)}`;
      } else if (rawWebUrl.startsWith('instagram.com/')) {
        finalWebsiteUrl = `https://${rawWebUrl}`;
      } else if (!/^https?:\/\//i.test(rawWebUrl)) {
        finalWebsiteUrl = `https://${rawWebUrl}`;
      } else {
        finalWebsiteUrl = rawWebUrl;
      }
    }

    if (editingSponsor) {
      updateSponsor({
        ...editingSponsor,
        name: sponsorForm.name.trim(),
        tier: sponsorForm.tier,
        logoText: finalLogoText,
        logoUrl: finalLogoUrl,
        websiteUrl: finalWebsiteUrl,
        description: sponsorForm.description.trim() || undefined,
      });
    } else {
      addSponsor({
        name: sponsorForm.name.trim(),
        tier: sponsorForm.tier,
        logoText: finalLogoText,
        logoUrl: finalLogoUrl,
        websiteUrl: finalWebsiteUrl,
        description: sponsorForm.description.trim() || undefined,
      });
    }

    setSponsorModalOpen(false);
  };

  // FILTERED REGISTRATIONS HELPER
  const filterList = (items: RegistrationItem[]) => {
    return items.filter(r => {
      const matchSearch =
        searchFilter === '' ||
        r.regCode.toLowerCase().includes(searchFilter.toLowerCase()) ||
        r.teamName.toLowerCase().includes(searchFilter.toLowerCase()) ||
        r.coachName.toLowerCase().includes(searchFilter.toLowerCase()) ||
        r.coachPhone.includes(searchFilter);
      const matchCat = categoryFilter === 'ALL' || r.category === categoryFilter;
      return matchSearch && matchCat;
    });
  };

  const pendingList = registrations.filter(r => r.status === 'PENDING_PAYMENT');
  const approvedList = registrations.filter(r => r.status === 'APPROVED');
  const rejectedList = registrations.filter(r => r.status === 'REJECTED');

  const totalCollectedRevenue = registrations
    .filter(r => r.paymentStatus === 'PAID')
    .reduce((acc, curr) => acc + curr.paymentAmount, 0);

  // 1. IF NOT LOGGED IN: SHOW LOGIN SCREEN
  if (!currentAdmin) {
    return (
      <div
        id="admin-login-overlay"
        className={`${
          isStandalonePage ? 'min-h-screen w-full' : 'fixed inset-0 z-50'
        } overflow-y-auto bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn transition-colors duration-300 relative`}
      >
        {/* AMBIENT LIGHT REFLECTIONS FOR STANDALONE LOGIN */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
          <div className="absolute -top-32 -left-32 w-96 h-96 bg-red-500/10 dark:bg-red-600/15 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute top-1/2 -right-32 w-96 h-96 bg-blue-500/10 dark:bg-blue-600/15 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-32 left-1/3 w-96 h-96 bg-amber-500/10 dark:bg-amber-600/10 rounded-full blur-3xl pointer-events-none" />
        </div>

        <div className="w-full max-w-md bg-white/85 dark:bg-slate-900/85 backdrop-blur-xl border border-slate-200/80 dark:border-white/10 rounded-3xl shadow-2xl p-8 text-slate-900 dark:text-white relative z-10 transition-all duration-300">
          <div className="absolute top-4 right-4 flex items-center space-x-1.5">
            <button
              type="button"
              onClick={toggleTheme}
              className="p-2 rounded-xl text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition cursor-pointer shadow-xs active:scale-95"
              title={theme === 'dark' ? 'Ganti ke Mode Terang' : 'Ganti ke Mode Gelap'}
              aria-label="Toggle Theme"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-500" />}
            </button>
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition cursor-pointer flex items-center space-x-1"
              title="Kembali ke Landing Page Utama"
            >
              <ArrowLeft className="w-3.5 h-3.5 mr-0.5" />
              <span>Beranda</span>
            </button>
          </div>

          <div className="text-center mb-6">
            <div className="flex items-center justify-center h-10 w-auto max-w-[42px] mx-auto mb-2 shrink-0">
              {config.wabupLogoUrl ? (
                <img loading="lazy"
                  src={config.wabupLogoUrl}
                  alt="Logo Wabup Cup"
                  className="h-10 w-auto max-w-[40px] object-contain drop-shadow-[0_4px_12px_rgba(220,38,38,0.45)]"
                />
              ) : (
                <WabupCupLogo className="h-10 w-auto max-w-[40px] object-contain drop-shadow-[0_4px_12px_rgba(220,38,38,0.45)]" />
              )}
            </div>
            <h3 className="text-2xl font-heading font-bold uppercase tracking-wider text-slate-900 dark:text-white">
              LOGIN ADMIN
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Silakan login dengan akun resmi panitia atau administrator.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            {loginError && (
              <div className="p-3 rounded-xl bg-red-100 dark:bg-red-950/80 border border-red-300 dark:border-red-700/60 text-red-700 dark:text-red-300 text-xs flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-500 dark:text-red-400" />
                <span>{loginError}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1.5">
                Username
              </label>
              <input
                type="text"
                required
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="username"
                className="w-full bg-slate-100/80 dark:bg-slate-950/80 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-red-500 focus:outline-none backdrop-blur-xs transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1.5">
                Kata Sandi (Password)
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-100/80 dark:bg-slate-950/80 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-red-500 focus:outline-none backdrop-blur-xs transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={isLoggingIn}
              className={`w-full py-3 rounded-xl bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-red-900/30 transition flex items-center justify-center space-x-2 cursor-pointer ${
                isLoggingIn ? 'opacity-70 cursor-not-allowed' : ''
              }`}
            >
              {isLoggingIn ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <Lock className="w-4 h-4" />
              )}
              <span>{isLoggingIn ? 'Memverifikasi Akun...' : 'Masuk ke Dashboard CMS'}</span>
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Helper for rendering navigation items in sidebar (supports both expanded and icon-only collapsed views)
  const renderSidebarItem = (
    tab: CmsTab,
    label: string,
    icon: React.ReactNode,
    badgeCount?: number,
    badgeText?: string,
    colorTheme: 'red' | 'amber' | 'emerald' | 'gradient' = 'red'
  ) => {
    const isActive = activeTab === tab;

    if (isSidebarCollapsed) {
      return (
        <button
          key={tab}
          type="button"
          onClick={() => setActiveTab(tab)}
          title={`${label}${badgeCount !== undefined ? ` (${badgeCount})` : badgeText ? ` [${badgeText}]` : ''}`}
          className={`w-full flex items-center justify-center p-3 rounded-xl transition cursor-pointer relative group my-1 ${
            isActive
              ? colorTheme === 'gradient'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-900/40 ring-1 ring-blue-400/50'
                : colorTheme === 'amber'
                ? 'bg-amber-600 text-white shadow-lg shadow-amber-900/40 ring-1 ring-amber-400/50'
                : colorTheme === 'emerald'
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/40 ring-1 ring-emerald-400/50'
                : 'bg-red-600 text-white shadow-lg shadow-red-900/40 ring-1 ring-red-400/50'
              : 'text-slate-400 hover:bg-slate-800/80 hover:text-white'
          }`}
        >
          <div className="w-5 h-5 flex items-center justify-center shrink-0">
            {icon}
          </div>
          {badgeCount !== undefined && badgeCount > 0 && (
            <span className="absolute -top-1 -right-1 px-1.5 py-0.2 rounded-full bg-slate-900 text-amber-300 text-[9px] font-mono border border-slate-700 font-bold shadow">
              {badgeCount > 99 ? '99+' : badgeCount}
            </span>
          )}
          {badgeText && (
            <span className="absolute -top-1 -right-1 px-1 py-0.2 rounded bg-emerald-500/40 text-emerald-200 text-[8px] font-bold border border-emerald-500/50">
              {badgeText}
            </span>
          )}
        </button>
      );
    }

    // Expanded View
    return (
      <button
        key={tab}
        type="button"
        onClick={() => setActiveTab(tab)}
        className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer my-0.5 ${
          isActive
            ? colorTheme === 'gradient'
              ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-900/30'
              : colorTheme === 'amber'
              ? 'bg-amber-600 text-white shadow-lg shadow-amber-900/20'
              : colorTheme === 'emerald'
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/20'
              : 'bg-red-600 text-white shadow-lg shadow-red-900/20'
            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/80 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-white'
        }`}
      >
        <div className="flex items-center space-x-3 truncate">
          <div className="w-4 h-4 flex items-center justify-center shrink-0">
            {icon}
          </div>
          <span className="truncate">{label}</span>
        </div>
        {badgeCount !== undefined && (
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full font-mono border ${
              isActive
                ? 'bg-black/30 text-white border-transparent'
                : 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
            }`}
          >
            {badgeCount}
          </span>
        )}
        {badgeText && (
          <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30">
            {badgeText}
          </span>
        )}
      </button>
    );
  };

  // Helper for rendering navigation items in mobile slide-out drawer
  const renderMobileNavItem = (
    tab: CmsTab,
    label: string,
    icon: React.ReactNode,
    badgeCount?: number,
    badgeText?: string
  ) => {
    const isActive = activeTab === tab;
    return (
      <button
        key={tab}
        type="button"
        onClick={() => {
          setActiveTab(tab);
          setIsMobileDrawerOpen(false);
        }}
        className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer my-0.5 ${
          isActive
            ? 'bg-red-600 text-white shadow-lg shadow-red-900/20'
            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/80 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-white'
        }`}
      >
        <div className="flex items-center space-x-3">
          <div className="w-4 h-4 flex items-center justify-center shrink-0">
            {icon}
          </div>
          <span>{label}</span>
        </div>
        {badgeCount !== undefined && (
          <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
            {badgeCount}
          </span>
        )}
        {badgeText && (
          <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30">
            {badgeText}
          </span>
        )}
      </button>
    );
  };

  // 2. MAIN LOGGED-IN ADMIN CMS PORTAL
  return (
    <div
      id="admin-dashboard-root"
      className="fixed inset-0 w-screen h-screen overflow-hidden bg-slate-50/80 dark:bg-[#0B1120]/80 text-slate-800 dark:text-slate-200 flex flex-col font-sans backdrop-blur-2xl animate-fadeIn transition-colors duration-200 z-40"
    >
      {/* AMBIENT LIGHT REFLECTIONS FOR TRANSPARENT GLASS EFFECT */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-red-500/10 dark:bg-red-600/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-1/2 -right-32 w-96 h-96 bg-blue-500/10 dark:bg-blue-600/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 left-1/3 w-96 h-96 bg-amber-500/10 dark:bg-amber-600/10 rounded-full blur-3xl pointer-events-none" />
      </div>

      {/* CMS TOP BAR - GLASS TRANSPARENT HEADER */}
      <header className="relative z-30 flex items-center justify-between px-4 sm:px-6 lg:px-8 py-3 bg-white/90 dark:bg-[#111827]/90 backdrop-blur-xl border-b border-slate-200/80 dark:border-slate-800/80 shadow-xs shrink-0 transition-colors duration-200">
        <div className="flex items-center space-x-2.5 sm:space-x-3.5">
          {/* MOBILE MENU TOGGLE BUTTON (DRAWER) */}
          <button
            type="button"
            onClick={() => setIsMobileDrawerOpen(prev => !prev)}
            className="md:hidden p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 dark:hover:text-white transition border border-slate-300 dark:border-slate-700 flex items-center justify-center cursor-pointer shadow-xs active:scale-95"
            title="Buka Menu Navigasi"
          >
            <Menu className="w-4 h-4 text-red-500" />
          </button>

          {/* DESKTOP/TABLET SIDEBAR COLLAPSE TOGGLE BUTTON */}
          <button
            type="button"
            onClick={toggleSidebarCollapse}
            className="hidden md:flex p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 dark:hover:text-white transition border border-slate-300 dark:border-slate-700 items-center justify-center cursor-pointer shadow-xs active:scale-95"
            title={isSidebarCollapsed ? "Perluas Menu Navigasi (Expand)" : "Kecilkan Menu ke Bentuk Ikon (Collapse)"}
          >
            {isSidebarCollapsed ? (
              <PanelLeftOpen className="w-4 h-4 text-amber-500 dark:text-amber-400" />
            ) : (
              <PanelLeftClose className="w-4 h-4 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white" />
            )}
          </button>

          <div>
            <h1 className="text-lg sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white leading-none">
              WABUP<span className="text-red-600 dark:text-red-500">CUP</span> 2026
            </h1>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-widest mt-0.5">
              Tournament Management System • {currentAdmin.role}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2.5 sm:space-x-4">
          <div className="hidden lg:flex items-center space-x-2 bg-slate-100/80 dark:bg-slate-800/80 px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700 backdrop-blur-xs">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">LIVE STATUS: ACTIVE</span>
          </div>

          {refreshToast && (
            <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-950/90 border border-emerald-300 dark:border-emerald-500/60 text-emerald-800 dark:text-emerald-300 text-xs font-bold animate-fadeIn shadow-xs">
              <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>{refreshToast}</span>
            </div>
          )}

          {/* THEME TOGGLE BUTTON (DARK / LIGHT SYNCED WITH LANDING & STANDALONE) */}
          <button
            type="button"
            onClick={toggleTheme}
            id="btn-admin-theme-toggle"
            aria-label={theme === 'dark' ? 'Ganti ke Mode Terang' : 'Ganti ke Mode Gelap'}
            title={theme === 'dark' ? 'Ganti ke Mode Terang (Light Mode)' : 'Ganti ke Mode Gelap (Dark Mode)'}
            className="p-1.5 sm:px-3 sm:py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 dark:hover:text-white border border-slate-300 dark:border-slate-700 text-xs font-semibold transition flex items-center space-x-1.5 cursor-pointer shadow-xs active:scale-95"
          >
            {theme === 'dark' ? (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden md:inline text-xs">Terang</span>
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5 text-indigo-500" />
                <span className="hidden md:inline text-xs">Gelap</span>
              </>
            )}
          </button>

          {/* TOMBOL REFRESH DATA (TANPA RELOAD BROWSER) */}
          <button
            type="button"
            onClick={handleRefreshData}
            disabled={isManualRefreshing || isSyncingWithServer}
            title="Segarkan & Sinkronisasi data dari server tanpa me-refresh browser"
            className={`px-3 py-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold transition flex items-center space-x-1.5 shadow-md shadow-blue-950/20 border border-blue-400/40 cursor-pointer ${
              (isManualRefreshing || isSyncingWithServer) ? 'opacity-70 cursor-not-allowed' : 'active:scale-95'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${(isManualRefreshing || isSyncingWithServer) ? 'animate-spin text-cyan-200' : 'text-blue-100'}`} />
            <span className="hidden sm:inline">
              {(isManualRefreshing || isSyncingWithServer) ? 'Menyinkronkan...' : 'Refresh Data'}
            </span>
            <span className="sm:hidden">
              {(isManualRefreshing || isSyncingWithServer) ? '...' : 'Refresh'}
            </span>
          </button>

          <div className="hidden sm:block h-6 w-px bg-slate-300 dark:bg-slate-700"></div>

          <button
            onClick={logoutAdmin}
            className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-red-50 text-slate-700 hover:text-red-700 border border-slate-300 hover:border-red-300 dark:bg-slate-800 dark:hover:bg-red-950/80 dark:border-slate-700 dark:hover:border-red-800 text-xs font-medium dark:text-slate-300 dark:hover:text-red-300 transition flex items-center space-x-1.5 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Logout</span>
          </button>

          <button
            onClick={onClose}
            className="bg-slate-200 hover:bg-slate-300 text-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors border border-slate-300 dark:border-slate-600 flex items-center space-x-1 cursor-pointer"
          >
            <span className="hidden sm:inline">Landing Page</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* CMS MAIN CONTAINER WITH SIDEBAR & CONTENT */}
      <div className="flex-1 flex overflow-hidden relative z-10 min-h-0">
        
        {/* MOBILE RESPONSIVE DRAWER OVERLAY */}
        {isMobileDrawerOpen && (
          <div className="fixed inset-0 z-50 md:hidden flex animate-fadeIn">
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black/70 backdrop-blur-xs transition-opacity"
              onClick={() => setIsMobileDrawerOpen(false)}
            />

            {/* Drawer container */}
            <div className="relative w-72 max-w-[85vw] bg-[#111827] border-r border-slate-800 p-4 flex flex-col h-full z-10 overflow-y-auto shadow-2xl">
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800 shrink-0">
                <div className="flex items-center space-x-2">
                  <LayoutGrid className="w-4 h-4 text-red-500" />
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    Menu Navigasi CMS
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsMobileDrawerOpen(false)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
                  title="Tutup Menu"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-1 overflow-y-auto flex-1">
                {/* Role badge */}
                <div className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 mb-3 text-[11px]">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">
                    Akses Login:
                  </span>
                  <div className="flex items-center space-x-1.5 mt-0.5">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        currentAdmin.role === 'SUPERADMIN'
                          ? 'bg-red-500'
                          : currentAdmin.role === 'PANITIA_INTI' || currentAdmin.role === 'PANITIA'
                          ? 'bg-indigo-500'
                          : currentAdmin.role === 'PANITIA_UMUM'
                          ? 'bg-emerald-500'
                          : currentAdmin.role === 'WASIT'
                          ? 'bg-amber-500'
                          : 'bg-cyan-500'
                      }`}
                    />
                    <strong className="text-white font-bold truncate">
                      {currentAdmin.fullName || currentAdmin.username}
                    </strong>
                  </div>
                  <span className="text-[10px] text-amber-400 font-semibold uppercase mt-0.5 block truncate">
                    Role: {currentAdmin.role}
                  </span>
                </div>

                {/* Mobile menu items based on role */}
                {(currentAdmin.role === 'WASIT' || currentAdmin.role === 'OPERATOR') ? (
                  <div>
                    <p className="px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                      Menu Pertandingan
                    </p>
                    {renderMobileNavItem(
                      'SCHEDULE_LIVESCORE',
                      'Jadwal & Live Score',
                      <Calendar className="w-4 h-4 text-white" />
                    )}
                  </div>
                ) : (
                  <>
                    <p className="px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                      Dashboard Menu
                    </p>
                    {renderMobileNavItem('OVERVIEW', 'Ringkasan & Statistik', <Activity className="w-4 h-4" />)}
                    {renderMobileNavItem('ALL_REGISTRATIONS', 'Semua Pendaftaran', <Users className="w-4 h-4" />, registrations.length)}
                    {renderMobileNavItem('PENDING_PAYMENT', 'Menunggu Bayar', <Clock className="w-4 h-4 text-yellow-500" />, pendingList.length)}
                    {renderMobileNavItem('APPROVED_TEAMS', 'Disetujui (Approved)', <CheckCircle2 className="w-4 h-4 text-emerald-400" />, approvedList.length)}
                    {renderMobileNavItem('REJECTED_TEAMS', 'Ditolak (Rejected)', <XCircle className="w-4 h-4 text-red-400" />, rejectedList.length)}

                    <p className="px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider pt-4 mb-2">
                      Manajemen Kompetisi
                    </p>
                    {canManageDrawing &&
                      renderMobileNavItem('DRAWING_RANDOMIZER', 'Pembagian Grup & Bagan', <Shuffle className="w-4 h-4 text-amber-400" />)}
                    {renderMobileNavItem('SCHEDULE_LIVESCORE', 'Jadwal & Live Score', <Calendar className="w-4 h-4 text-blue-400" />)}
                    {renderMobileNavItem('PLAYER_MANAGER', 'Data Pemain & Excel', <Users className="w-4 h-4 text-emerald-400" />)}

                    {canManageCategories &&
                      renderMobileNavItem('CATEGORIES_PRIZES', 'Kategori & Hadiah', <Trophy className="w-4 h-4 text-yellow-400" />)}
                    {canManageSponsors &&
                      renderMobileNavItem('SPONSORS', 'Sponsorship', <Users className="w-4 h-4 text-purple-400" />)}

                    {canManageSettings && (
                      <>
                        <p className="px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider pt-4 mb-2">
                          Pengaturan
                        </p>
                        {renderMobileNavItem('SETTINGS', 'Pengaturan & Berkas', <Settings className="w-4 h-4 text-cyan-400" />)}
                      </>
                    )}

                    {isSuperAdmin && (
                      <>
                        <p className="px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider pt-4 mb-2">
                          Sistem
                        </p>
                        {renderMobileNavItem('ADMIN_USERS', 'Kelola Admin Users', <Shield className="w-4 h-4 text-emerald-400" />)}
                        {renderMobileNavItem('MYSQL_DATABASE_MANAGER', 'Database', <Database className="w-4 h-4 text-emerald-400" />, undefined, 'PRO')}
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* SIDEBAR NAVIGATION - RESPONSIVE & COLLAPSIBLE (ICON ONLY OR FULL) */}
        <aside
          className={`${
            isSidebarCollapsed ? 'w-20 px-2 py-3.5' : 'w-64 p-4'
          } bg-white/75 dark:bg-[#111827]/75 backdrop-blur-xl border-r border-slate-200/80 dark:border-slate-800/80 flex flex-col shrink-0 h-full overflow-y-auto hidden md:flex transition-all duration-300 ease-in-out select-none`}
        >
          {/* HEADER BAR AT TOP OF SIDEBAR WITH TOGGLE */}
          <div
            className={`flex items-center ${
              isSidebarCollapsed ? 'justify-center' : 'justify-between'
            } pb-3 mb-3 border-b border-slate-200 dark:border-slate-800 shrink-0`}
          >
            {!isSidebarCollapsed && (
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center space-x-1.5">
                <LayoutGrid className="w-3.5 h-3.5 text-red-500" />
                <span>Navigasi Menu</span>
              </span>
            )}
            <button
              type="button"
              onClick={toggleSidebarCollapse}
              title={
                isSidebarCollapsed
                  ? 'Perluas Menu Navigasi (Expand)'
                  : 'Kecilkan Menu ke Bentuk Ikon (Collapse)'
              }
              className={`p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-400 dark:hover:text-white transition flex items-center justify-center cursor-pointer border border-slate-300 dark:border-slate-700 active:scale-95 shadow-xs ${
                isSidebarCollapsed ? 'w-10 h-10' : ''
              }`}
            >
              {isSidebarCollapsed ? (
                <ChevronRight className="w-4 h-4 text-amber-500 dark:text-amber-400" />
              ) : (
                <ChevronLeft className="w-4 h-4 text-slate-500 dark:text-slate-300" />
              )}
            </button>
          </div>

          <div className="space-y-1 mb-6 flex-1">
            {/* ROLE BADGE NOTIFICATION */}
            {isSidebarCollapsed ? (
              <div
                className="p-2 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 mb-3 flex flex-col items-center justify-center text-center cursor-help"
                title={`Akses Login: ${currentAdmin.fullName || currentAdmin.username} (${currentAdmin.role})`}
              >
                <div className="relative">
                  <div className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 flex items-center justify-center text-xs font-black text-slate-800 dark:text-white uppercase">
                    {(currentAdmin.username || 'A').slice(0, 2)}
                  </div>
                  <span
                    className={`w-2.5 h-2.5 rounded-full absolute -top-0.5 -right-0.5 border border-white dark:border-slate-900 ${
                      currentAdmin.role === 'SUPERADMIN'
                        ? 'bg-red-500'
                        : currentAdmin.role === 'PANITIA_INTI' || currentAdmin.role === 'PANITIA'
                        ? 'bg-indigo-500'
                        : currentAdmin.role === 'PANITIA_UMUM'
                        ? 'bg-emerald-500'
                        : currentAdmin.role === 'WASIT'
                        ? 'bg-amber-500'
                        : 'bg-cyan-500'
                    }`}
                  />
                </div>
              </div>
            ) : (
              <div className="px-3 py-2 rounded-xl bg-slate-100/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 mb-3 text-[11px]">
                <span className="text-slate-500 dark:text-slate-400 block text-[10px] uppercase font-bold">
                  Akses Login:
                </span>
                <div className="flex items-center space-x-1.5 mt-0.5">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      currentAdmin.role === 'SUPERADMIN'
                        ? 'bg-red-500'
                        : currentAdmin.role === 'PANITIA_INTI' || currentAdmin.role === 'PANITIA'
                        ? 'bg-indigo-500'
                        : currentAdmin.role === 'PANITIA_UMUM'
                        ? 'bg-emerald-500'
                        : currentAdmin.role === 'WASIT'
                        ? 'bg-amber-500'
                        : 'bg-cyan-500'
                    }`}
                  ></span>
                  <strong className="text-slate-900 dark:text-white font-bold truncate">
                    {currentAdmin.fullName || currentAdmin.username}
                  </strong>
                </div>
                <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold uppercase mt-0.5 block truncate">
                  Role:{' '}
                  {currentAdmin.role === 'SUPERADMIN'
                    ? 'Super Administrator'
                    : currentAdmin.role === 'PANITIA_INTI'
                    ? 'Panitia Inti'
                    : currentAdmin.role === 'PANITIA'
                    ? 'Panitia Inti'
                    : currentAdmin.role === 'PANITIA_UMUM'
                    ? 'Panitia Umum'
                    : currentAdmin.role === 'WASIT'
                    ? 'Wasit Turnamen'
                    : 'Operator Live Score'}
                </span>
              </div>
            )}

            {/* WASIT / OPERATOR: ONLY JADWAL PERTANDINGAN */}
            {isWasitOrOperator ? (
              <div>
                {!isSidebarCollapsed ? (
                  <p className="px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Menu Pertandingan
                  </p>
                ) : (
                  <div className="my-2 border-t border-slate-800/80" />
                )}
                {renderSidebarItem(
                  'SCHEDULE_LIVESCORE',
                  'Jadwal & Live Score',
                  <Calendar className="w-4 h-4 text-white" />
                )}
              </div>
            ) : (
              <>
                {/* MENU DASHBOARD & PENDAFTARAN */}
                {!isSidebarCollapsed ? (
                  <p className="px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Dashboard Menu
                  </p>
                ) : (
                  <div className="my-1.5 border-t border-slate-800/80" />
                )}

                {renderSidebarItem(
                  'OVERVIEW',
                  'Ringkasan & Statistik',
                  <Activity className="w-4 h-4" />
                )}

                {renderSidebarItem(
                  'ALL_REGISTRATIONS',
                  'Pendaftaran',
                  <Users className="w-4 h-4" />,
                  registrations.length
                )}

                {renderSidebarItem(
                  'PENDING_PAYMENT',
                  'Menunggu Bayar',
                  <Clock className="w-4 h-4 text-yellow-500" />,
                  pendingList.length,
                  undefined,
                  'amber'
                )}

                {renderSidebarItem(
                  'APPROVED_TEAMS',
                  'Disetujui (Approved)',
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
                  approvedList.length,
                  undefined,
                  'emerald'
                )}

                {renderSidebarItem(
                  'REJECTED_TEAMS',
                  'Ditolak (Rejected)',
                  <XCircle className="w-4 h-4 text-red-400" />,
                  rejectedList.length
                )}

                {/* MANAJEMEN KOMPETISI */}
                {!isSidebarCollapsed ? (
                  <p className="px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider pt-4 mb-2">
                    Manajemen Kompetisi
                  </p>
                ) : (
                  <div className="my-2 border-t border-slate-800/80" />
                )}

                {canManageDrawing &&
                  renderSidebarItem(
                    'DRAWING_RANDOMIZER',
                    'Pembagian Grup & Bagan',
                    <Shuffle className="w-4 h-4 text-amber-400" />
                  )}

                {renderSidebarItem(
                  'SCHEDULE_LIVESCORE',
                  'Jadwal & Live Score',
                  <Calendar className="w-4 h-4 text-blue-400" />
                )}

                {renderSidebarItem(
                  'PLAYER_MANAGER',
                  'Data Pemain & Excel',
                  <Users className="w-4 h-4 text-emerald-400" />
                )}

                {/* KATEGORI & SPONSOR */}
                {canManageCategories &&
                  renderSidebarItem(
                    'CATEGORIES_PRIZES',
                    'Kategori & Hadiah',
                    <Trophy className="w-4 h-4 text-yellow-400" />
                  )}

                {canManageSponsors &&
                  renderSidebarItem(
                    'SPONSORS',
                    'Sponsorship',
                    <Users className="w-4 h-4 text-purple-400" />
                  )}

                {/* PENGATURAN TURNAMEN */}
                {canManageSettings && (
                  <>
                    {!isSidebarCollapsed ? (
                      <p className="px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider pt-4 mb-2">
                        Pengaturan Turnamen
                      </p>
                    ) : (
                      <div className="my-2 border-t border-slate-800/80" />
                    )}
                    {renderSidebarItem(
                      'SETTINGS',
                      'Pengaturan & Berkas',
                      <Settings className="w-4 h-4 text-cyan-400" />
                    )}
                  </>
                )}

                {/* SISTEM & SINKRONISASI (SUPERADMIN) */}
                {isSuperAdmin && (
                  <>
                    {!isSidebarCollapsed ? (
                      <p className="px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider pt-4 mb-2">
                        Sistem & Sinkronisasi
                      </p>
                    ) : (
                      <div className="my-2 border-t border-slate-800/80" />
                    )}

                    {renderSidebarItem(
                      'ADMIN_USERS',
                      'Kelola Admin Users',
                      <Shield className="w-4 h-4 text-emerald-400" />
                    )}

                    {renderSidebarItem(
                      'MYSQL_DATABASE_MANAGER',
                      'Database',
                      <Database className="w-4 h-4 text-emerald-400" />,
                      undefined,
                      'PRO',
                      'gradient'
                    )}
                  </>
                )}
              </>
            )}
          </div>

          {/* DATABASE SYNC STATUS WIDGET */}
          {isSidebarCollapsed ? (
            <div
              className="mt-auto p-2 bg-slate-800/60 rounded-xl border border-slate-700 flex flex-col items-center justify-center space-y-2 shrink-0"
              title={`Database Sync: ${dbStatus?.connected ? 'Online' : 'Offline'} - Klik untuk segarkan`}
            >
              <div className="relative">
                <Database className="w-5 h-5 text-blue-400" />
                <span
                  className={`w-2 h-2 rounded-full absolute -top-0.5 -right-0.5 ${
                    dbStatus?.connected
                      ? 'bg-emerald-400 shadow-sm shadow-emerald-400 animate-pulse'
                      : 'bg-amber-400'
                  }`}
                />
              </div>
              <button
                type="button"
                onClick={handleRefreshData}
                disabled={isManualRefreshing || isSyncingWithServer}
                title="Segarkan Data Server"
                className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 transition cursor-pointer disabled:opacity-50 active:scale-95"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${
                    isManualRefreshing || isSyncingWithServer
                      ? 'animate-spin text-cyan-400'
                      : 'text-slate-300'
                  }`}
                />
              </button>
            </div>
          ) : (
            <div className="mt-auto p-3.5 bg-slate-800/60 rounded-xl border border-slate-700 shrink-0">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-slate-200 flex items-center space-x-1.5">
                  <Database className="w-3.5 h-3.5 text-blue-400" />
                  <span>Database Sync</span>
                </span>
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    dbStatus?.connected
                      ? 'bg-emerald-400 shadow-sm shadow-emerald-400 animate-pulse'
                      : 'bg-amber-400'
                  }`}
                ></span>
              </div>
              <p className="text-[11px] text-slate-300 font-medium truncate">
                {dbStatus?.connected
                  ? `Online: ${dbStatus.host.split('.')[0] || 'TiDB/MySQL'}`
                  : 'Mode Cache / Fallback'}
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                {dbStatus?.connected
                  ? 'Semua data tersinkron langsung ke database'
                  : dbStatus?.error
                  ? 'Periksa kredensial database di tab Database'
                  : 'Menghubungkan...'}
              </p>
              <div className="w-full bg-slate-700 h-1.5 rounded-full overflow-hidden mt-2">
                <div
                  className={`h-full rounded-full ${
                    dbStatus?.connected
                      ? 'bg-emerald-500 w-full'
                      : 'bg-amber-500 w-1/2'
                  }`}
                ></div>
              </div>

              <button
                type="button"
                onClick={handleRefreshData}
                disabled={isManualRefreshing || isSyncingWithServer}
                title="Sinkronisasi data langsung dari database server tanpa reload browser"
                className="w-full mt-2.5 py-1.5 px-2.5 rounded-lg bg-slate-700/80 hover:bg-slate-700 hover:text-white text-[11px] font-semibold text-slate-200 transition flex items-center justify-center space-x-1.5 border border-slate-600/80 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <RefreshCw
                  className={`w-3 h-3 ${
                    isManualRefreshing || isSyncingWithServer
                      ? 'animate-spin text-cyan-400'
                      : 'text-slate-300'
                  }`}
                />
                <span>
                  {isManualRefreshing || isSyncingWithServer
                    ? 'Menyegarkan Data...'
                    : 'Segarkan Data'}
                </span>
              </button>
            </div>
          )}
        </aside>

        {/* CMS CONTENT AREA */}
        <main id="admin-main-content" className="flex-1 h-full min-h-0 bg-slate-100/70 dark:bg-[#0B1120]/80 backdrop-blur-2xl overflow-y-auto p-4 sm:p-6 lg:p-8 flex flex-col space-y-6 transition-colors duration-200">
          
          {/* MOBILE TABS SELECTOR - RBAC ENFORCED */}
          <div className="md:hidden mb-2">
            <select
              value={activeTab}
              onChange={e => setActiveTab(e.target.value as CmsTab)}
              className="w-full bg-white/85 dark:bg-[#1E293B]/85 border border-slate-200/80 dark:border-slate-700 rounded-xl p-3 text-xs font-bold text-slate-900 dark:text-white focus:outline-none backdrop-blur-md"
            >
              {isWasitOrOperator ? (
                <option value="SCHEDULE_LIVESCORE">📅 Jadwal Pertandingan & Live Score</option>
              ) : (
                <>
                  <option value="OVERVIEW">📊 Ringkasan & Statistik</option>
                  <option value="ALL_REGISTRATIONS">📋 Semua Pendaftaran ({registrations.length})</option>
                  <option value="PENDING_PAYMENT">⏳ Menunggu Pembayaran ({pendingList.length})</option>
                  <option value="APPROVED_TEAMS">✅ Tim Disetujui ({approvedList.length})</option>
                  <option value="REJECTED_TEAMS">❌ Pendaftaran Ditolak ({rejectedList.length})</option>
                  {canManageDrawing && (
                    <option value="DRAWING_RANDOMIZER">🎲 Pembagian Grup & Drag-Drop</option>
                  )}
                  <option value="SCHEDULE_LIVESCORE">📅 Jadwal Pertandingan & Live Score</option>
                  <option value="PLAYER_MANAGER">👥 Manajemen Data Pemain & Excel</option>
                  {canManageCategories && (
                    <option value="CATEGORIES_PRIZES">🏆 Kategori & Hadiah</option>
                  )}
                  {canManageSponsors && (
                    <option value="SPONSORS">🤝 Sponsorship</option>
                  )}
                  {canManageSettings && (
                    <option value="SETTINGS">⚙️ Pengaturan & Berkas (Settings)</option>
                  )}
                  {canManageAdminUsers && (
                    <option value="ADMIN_USERS">🛡️ Kelola Admin Users</option>
                  )}
                  {canManageDatabase && (
                    <option value="MYSQL_DATABASE_MANAGER">🗄️ Database</option>
                  )}
                </>
              )}
            </select>
          </div>

          {/* TAB 1: OVERVIEW & ANALYTICS */}
          {activeTab === 'OVERVIEW' && (
            <div className="space-y-6 animate-fadeIn">
              <div>
                <h3 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white uppercase">
                  DASHBOARD RINGKASAN TURNAMEN
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Pantau pertumbuhan registrasi, verifikasi berkas, dan pergerakan peserta secara real-time.
                </p>
              </div>

              {/* 4 STATS CARDS */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white/80 dark:bg-[#1E293B]/80 backdrop-blur-md border border-slate-200/80 dark:border-slate-700 rounded-2xl p-5 shadow-sm dark:shadow-xl">
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
                    <span className="font-semibold">Total Tim Mendaftar</span>
                    <Users className="w-4 h-4 text-blue-500 dark:text-blue-400" />
                  </div>
                  <div className="text-3xl font-black text-slate-900 dark:text-white">
                    {registrations.length} <span className="text-xs text-slate-500 font-normal">Tim</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Seluruh 6 kategori kompetisi</p>
                </div>

                <div className="bg-white/80 dark:bg-[#1E293B]/80 backdrop-blur-md border border-slate-200/80 dark:border-slate-700 rounded-2xl p-5 shadow-sm dark:shadow-xl">
                  <div className="flex items-center justify-between text-xs text-emerald-600 dark:text-green-400 mb-2">
                    <span className="font-semibold">Disetujui (Approved)</span>
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 dark:text-green-400" />
                  </div>
                  <div className="text-3xl font-black text-emerald-600 dark:text-emerald-400">
                    {approvedList.length} <span className="text-xs text-slate-500 font-normal">Tim</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Siap masuk drawing bracket</p>
                </div>

                <div className="bg-white/80 dark:bg-[#1E293B]/80 backdrop-blur-md border border-slate-200/80 dark:border-slate-700 rounded-2xl p-5 shadow-sm dark:shadow-xl">
                  <div className="flex items-center justify-between text-xs text-amber-600 dark:text-yellow-400 mb-2">
                    <span className="font-semibold">Menunggu Bayar</span>
                    <Clock className="w-4 h-4 text-amber-500 dark:text-yellow-400" />
                  </div>
                  <div className="text-3xl font-black text-amber-600 dark:text-amber-400">
                    {pendingList.length} <span className="text-xs text-slate-500 font-normal">Tim</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Perlu verifikasi transfer</p>
                </div>

                <div className="bg-white/80 dark:bg-[#1E293B]/80 backdrop-blur-md border border-slate-200/80 dark:border-slate-700 rounded-2xl p-5 shadow-sm dark:shadow-xl">
                  <div className="flex items-center justify-between text-xs text-red-500 dark:text-red-400 mb-2">
                    <span className="font-semibold">Total Uang Registrasi</span>
                    <DollarSign className="w-4 h-4 text-red-500 dark:text-red-400" />
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
                    Rp {totalCollectedRevenue.toLocaleString('id-ID')}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Dari tim berstatus lunas (PAID)</p>
                </div>
              </div>

              {/* CATEGORY DISTRIBUTION BARS */}
              <div className="bg-white/80 dark:bg-[#1E293B]/80 backdrop-blur-md border border-slate-200/80 dark:border-slate-700 rounded-2xl p-6 shadow-sm dark:shadow-xl">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-4">
                  Distribusi Pendaftaran Berdasarkan Kategori
                </h4>

                <div className="space-y-4">
                  {categories.map(cat => {
                    const count = registrations.filter(r => r.category === cat.id).length;
                    const percent = Math.min(100, Math.round((count / cat.maxTeams) * 100));

                    return (
                      <div key={cat.id} className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs font-semibold">
                          <span className="text-slate-800 dark:text-slate-200">
                            {cat.name} ({cat.id})
                          </span>
                          <span className="text-slate-500 dark:text-slate-400 font-mono">
                            {count} / {cat.maxTeams} Tim ({percent}%)
                          </span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-900 overflow-hidden border border-slate-300 dark:border-slate-800">
                          <div
                            className="h-full bg-gradient-to-r from-red-600 to-blue-600 rounded-full"
                            style={{ width: `${percent}%` }}
                          ></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2, 3, 4, 5: REGISTRATION TABLES (SEMUA, PENDING, APPROVED, REJECTED) */}
          {(activeTab === 'ALL_REGISTRATIONS' ||
            activeTab === 'PENDING_PAYMENT' ||
            activeTab === 'APPROVED_TEAMS' ||
            activeTab === 'REJECTED_TEAMS') && (
            <div className="space-y-6 animate-fadeIn">
              
              {/* TABLE HEADER & FILTER BAR (STICKY AT TOP OF MAIN) */}
              <div className="sticky top-0 z-20 -mx-4 -mt-4 sm:-mx-6 sm:-mt-6 lg:-mx-8 lg:-mt-8 p-4 sm:p-6 lg:p-8 bg-slate-100/95 dark:bg-[#0B1120]/95 backdrop-blur-xl border-b border-slate-200/80 dark:border-slate-800/80 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs transition-colors">
                <div>
                  <h3 className="text-2xl font-heading font-bold uppercase tracking-wide text-slate-900 dark:text-white">
                    {activeTab === 'ALL_REGISTRATIONS' && 'SEMUA BERKAS PENDAFTARAN TIM'}
                    {activeTab === 'PENDING_PAYMENT' && 'TAB KHUSUS: MENUNGGU PEMBAYARAN'}
                    {activeTab === 'APPROVED_TEAMS' && 'TAB KHUSUS: PENDAFTARAN DISETUJUI (APPROVED)'}
                    {activeTab === 'REJECTED_TEAMS' && 'TAB KHUSUS: PENDAFTARAN DITOLAK (REJECTED)'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Gunakan tabel ini untuk verifikasi berkas PDF, mengubah status, dan mengirim notifikasi WhatsApp otomatis.
                  </p>
                </div>

                {/* SEARCH & CATEGORY SELECTOR */}
                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="text"
                      placeholder="Cari tim, kode, WA..."
                      value={searchFilter}
                      onChange={e => setSearchFilter(e.target.value)}
                      className="bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-4 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-red-500 w-48 sm:w-60"
                    />
                  </div>

                  <select
                    value={categoryFilter}
                    onChange={e => setCategoryFilter(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                  >
                    <option value="ALL">Semua Kategori</option>
                    <option value="SD">SD (U-12)</option>
                    <option value="SMP">SMP</option>
                    <option value="SMA">SMA</option>
                    <option value="INSTANSI">Instansi</option>
                    <option value="UMUM">Umum</option>
                    <option value="DESA">Desa</option>
                  </select>

                  {/* TOMBOL REFRESH, UNDUH EXCEL & PDF RESMI */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleRefreshData}
                      disabled={isManualRefreshing || isSyncingWithServer}
                      className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center space-x-1.5 border border-slate-700 shadow-sm transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                      title="Segarkan daftar pendaftaran dari database tanpa reload browser"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${(isManualRefreshing || isSyncingWithServer) ? 'animate-spin text-cyan-400' : 'text-slate-300'}`} />
                      <span>{(isManualRefreshing || isSyncingWithServer) ? 'Menyinkronkan...' : 'Refresh'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const baseList =
                          activeTab === 'ALL_REGISTRATIONS'
                            ? registrations
                            : activeTab === 'PENDING_PAYMENT'
                            ? pendingList
                            : activeTab === 'APPROVED_TEAMS'
                            ? approvedList
                            : rejectedList;
                        const toExport = filterList(baseList);
                        if (toExport.length === 0) {
                          alert('Tidak ada data pendaftaran untuk diunduh.');
                          return;
                        }
                        exportRegistrationsToExcel(toExport, config.name, categoryFilter);
                      }}
                      className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center space-x-1.5 shadow-md shadow-emerald-950/40 transition cursor-pointer"
                      title="Download Rekap Data Pendaftar Format Excel (.xlsx)"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      <span>Unduh Excel</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const baseList =
                          activeTab === 'ALL_REGISTRATIONS'
                            ? registrations
                            : activeTab === 'PENDING_PAYMENT'
                            ? pendingList
                            : activeTab === 'APPROVED_TEAMS'
                            ? approvedList
                            : rejectedList;
                        const toExport = filterList(baseList);
                        if (toExport.length === 0) {
                          alert('Tidak ada data pendaftaran untuk diunduh.');
                          return;
                        }
                        exportRegistrationsToPdf(toExport, config.name, categoryFilter);
                      }}
                      className="px-3 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs flex items-center space-x-1.5 shadow-md shadow-red-950/40 transition cursor-pointer"
                      title="Download Rekap Data Pendaftar Format Tabel PDF (.pdf)"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Unduh PDF</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* RENDER TABLE */}
              {(() => {
                const baseList =
                  activeTab === 'ALL_REGISTRATIONS'
                    ? registrations
                    : activeTab === 'PENDING_PAYMENT'
                    ? pendingList
                    : activeTab === 'APPROVED_TEAMS'
                    ? approvedList
                    : rejectedList;

                const displayItems = filterList(baseList);

                return (
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl flex flex-col">
                    <div className="overflow-x-auto max-h-[calc(100vh-270px)] overflow-y-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead className="sticky top-0 z-10 bg-slate-950 text-slate-400 font-bold uppercase tracking-wider border-b border-slate-800 shadow-sm">
                          <tr>
                            <th className="py-3.5 px-4 bg-slate-950">Kode / Tim</th>
                            <th className="py-3.5 px-4 bg-slate-950">Kategori & Asal</th>
                            <th className="py-3.5 px-4 bg-slate-950">Pelatih & Kontak</th>
                            <th className="py-3.5 px-4 bg-slate-950">Dokumen PDF</th>
                            <th className="py-3.5 px-4 bg-slate-950">Biaya & Pembayaran</th>
                            <th className="py-3.5 px-4 bg-slate-950">Status</th>
                            <th className="py-3.5 px-4 text-center bg-slate-950">Aksi / Notifikasi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                          {displayItems.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="text-center py-10 text-slate-500">
                                Tidak ada data pendaftaran ditemukan pada tabel ini.
                              </td>
                            </tr>
                          ) : (
                            displayItems.map(item => (
                              <tr key={item.id} className="hover:bg-slate-800/60 transition">
                                
                                {/* KODE & NAMA TIM */}
                                <td className="py-3.5 px-4">
                                  <span className="font-mono text-red-400 font-bold block">
                                    {item.regCode}
                                  </span>
                                  <span className="font-bold text-white text-sm">
                                    {item.teamName}
                                  </span>
                                  <span className="text-[10px] text-slate-400 block">
                                    Daftar: {item.registrationDate}
                                  </span>
                                </td>

                                {/* KATEGORI */}
                                <td className="py-3.5 px-4">
                                  <span className="px-2 py-0.5 rounded-md bg-slate-950 font-bold text-slate-300 border border-slate-800">
                                    {item.category}
                                  </span>
                                  <p className="text-[11px] text-slate-300 font-medium mt-1 truncate max-w-[150px]">
                                    {item.institutionName}
                                  </p>
                                </td>

                                {/* PELATIH & WA */}
                                <td className="py-3.5 px-4">
                                  <span className="font-semibold text-white block">
                                    {item.coachName}
                                  </span>
                                  <span className="font-mono text-[11px] text-slate-400 flex items-center space-x-1 mt-0.5">
                                    <Phone className="w-3 h-3 text-emerald-400" />
                                    <span>{item.coachPhone}</span>
                                  </span>
                                </td>

                                {/* DOKUMEN PDF BUTTONS (DYNAMIC FOR ALL CATEGORIES) */}
                                <td className="py-3.5 px-4">
                                  {(() => {
                                    const docs = item.documents || {};
                                    const validEntries = Object.entries(docs).filter(([key, doc]) => doc && doc.name && !( !isSuratKeteranganRequired(item.category) && key === 'suratKeterangan' ));
                                    const reqDocs = getRequiredDocsForCategory(item.category);
                                    const uploadedReqCount = reqDocs.filter(r => Boolean((docs as any)[r.key])).length;
                                    const isComplete = uploadedReqCount >= reqDocs.length;

                                    return (
                                      <div className="space-y-1.5 min-w-[200px] max-w-[280px]">
                                        {/* Status Kelengkapan Checklist Header */}
                                        <div className="flex items-center justify-between gap-1">
                                          <button
                                            onClick={() => setInspectDocsItem(item)}
                                            className={`px-2 py-0.5 rounded text-[10px] font-bold border transition flex items-center space-x-1 cursor-pointer ${
                                              isComplete
                                                ? 'bg-emerald-950 text-emerald-300 border-emerald-700/60 hover:bg-emerald-900'
                                                : uploadedReqCount > 0
                                                ? 'bg-amber-950 text-amber-300 border-amber-700/60 hover:bg-amber-900'
                                                : 'bg-red-950 text-red-300 border-red-700/60 hover:bg-red-900'
                                            }`}
                                            title="Klik untuk membuka panel verifikasi berkas lengkap"
                                          >
                                            <span>{uploadedReqCount}/{reqDocs.length} Berkas {isComplete ? 'Lengkap' : ''}</span>
                                            <ExternalLink className="w-2.5 h-2.5 opacity-75" />
                                          </button>
                                          {validEntries.length > 0 && (
                                            <span className="text-[10px] text-slate-400 font-mono">
                                              {validEntries.length} file
                                            </span>
                                          )}
                                        </div>

                                        {/* Dynamic List of Uploaded Documents */}
                                        {validEntries.length === 0 ? (
                                          <p className="text-[10px] text-slate-500 italic flex items-center space-x-1">
                                            <AlertTriangle className="w-3 h-3 text-amber-500/70 shrink-0" />
                                            <span>Belum ada berkas</span>
                                          </p>
                                        ) : (
                                          <div className="flex flex-wrap gap-1">
                                            {validEntries.map(([key, doc]) => {
                                              if (!doc) return null;
                                              const info = getDocDisplayInfo(key, item.category);
                                              return (
                                                <button
                                                  key={key}
                                                  onClick={() => handleOpenPdf(doc, info.title, item.teamName)}
                                                  title={`${info.title} (${doc.name} • ${doc.size || 'PDF'})`}
                                                  className={`px-2 py-0.5 rounded text-[10px] font-medium border flex items-center space-x-1 transition shadow-sm cursor-pointer ${info.color}`}
                                                >
                                                  <Eye className="w-2.5 h-2.5 shrink-0" />
                                                  <span className="truncate max-w-[120px]">{info.label}</span>
                                                </button>
                                              );
                                            })}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })()}
                                </td>

                                {/* BIAYA & PEMBAYARAN */}
                                <td className="py-3.5 px-4 whitespace-nowrap">
                                  <span className="font-bold text-white block">
                                    Rp {item.paymentAmount.toLocaleString('id-ID')}
                                  </span>
                                  <select
                                    value={item.paymentStatus}
                                    onChange={e => updatePaymentStatus(item.id, e.target.value as PaymentStatus)}
                                    className={`mt-1 text-[10px] font-bold rounded px-2 py-0.5 border focus:outline-none ${
                                      item.paymentStatus === 'PAID'
                                        ? 'bg-emerald-950 text-emerald-400 border-emerald-700'
                                        : item.paymentStatus === 'VERIFYING'
                                        ? 'bg-blue-950 text-blue-400 border-blue-700'
                                        : 'bg-amber-950 text-amber-400 border-amber-700'
                                    }`}
                                  >
                                    <option value="UNPAID">Belum Bayar</option>
                                    <option value="VERIFYING">Sedang Dicek</option>
                                    <option value="PAID">Lunas (Paid)</option>
                                  </select>
                                </td>

                                {/* STATUS VERIFIKASI */}
                                <td className="py-3.5 px-4 whitespace-nowrap">
                                  {item.status === 'APPROVED' && (
                                    <span className="px-2.5 py-1 rounded-full bg-emerald-950 text-emerald-400 font-bold border border-emerald-700 flex items-center space-x-1 w-fit">
                                      <CheckCircle2 className="w-3 h-3" />
                                      <span>Approved</span>
                                    </span>
                                  )}
                                  {item.status === 'PENDING_PAYMENT' && (
                                    <span className="px-2.5 py-1 rounded-full bg-amber-950 text-amber-400 font-bold border border-amber-700 flex items-center space-x-1 w-fit">
                                      <Clock className="w-3 h-3" />
                                      <span>Pending Bayar</span>
                                    </span>
                                  )}
                                  {item.status === 'REJECTED' && (
                                    <span className="px-2.5 py-1 rounded-full bg-rose-950 text-rose-400 font-bold border border-rose-700 flex items-center space-x-1 w-fit" title={item.rejectionReason}>
                                      <XCircle className="w-3 h-3" />
                                      <span>Ditolak</span>
                                    </span>
                                  )}
                                </td>

                                {/* AKSI & NOTIFIKASI WHATSAPP */}
                                <td className="py-3.5 px-4 text-center">
                                  <div className="flex items-center justify-center space-x-1.5">
                                    
                                    {/* Setujui / Approve - Sembunyikan jika sudah disetujui (APPROVED) */}
                                    {item.status !== 'APPROVED' && (
                                      <button
                                        onClick={() => updateRegistrationStatus(item.id, 'APPROVED')}
                                        className="p-1.5 rounded-lg bg-emerald-950 hover:bg-emerald-800 text-emerald-300 border border-emerald-700 cursor-pointer transition shadow-sm"
                                        title="Setujui Berkas Tim Ini"
                                      >
                                        <CheckCircle2 className="w-4 h-4" />
                                      </button>
                                    )}

                                    {/* Tolak / Reject - Sembunyikan jika sudah ditolak (REJECTED) */}
                                    {item.status !== 'REJECTED' && (
                                      <button
                                        onClick={() => handleOpenReject(item)}
                                        className="p-1.5 rounded-lg bg-rose-950 hover:bg-rose-800 text-rose-300 border border-rose-700 cursor-pointer transition shadow-sm"
                                        title="Tolak / Minta Perbaikan Berkas"
                                      >
                                        <XCircle className="w-4 h-4" />
                                      </button>
                                    )}

                                    {/* Kirim WhatsApp Otomatis */}
                                    <a
                                      href={getWhatsAppNotificationUrl(
                                        item,
                                        item.paymentStatus === 'PAID'
                                          ? 'INVOICE'
                                          : item.status === 'APPROVED'
                                          ? 'APPROVED'
                                          : item.status === 'REJECTED'
                                          ? 'REJECTED'
                                          : 'PAYMENT_REMINDER'
                                      )}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer transition shadow-sm"
                                      title={
                                        item.paymentStatus === 'PAID'
                                          ? 'Kirim Pesan Konfirmasi Lunas & Invoice Resmi ke WhatsApp Pelatih'
                                          : 'Kirim Notifikasi WhatsApp Resmi ke Pelatih'
                                      }
                                    >
                                      <Phone className="w-4 h-4" />
                                    </a>

                                    {/* Tombol Invoice & Kuitansi Resmi Cap Wabup Cup 2026 & TTD Ketua Panitia */}
                                    <button
                                      onClick={() => handleOpenInvoice(item)}
                                      className={`p-1.5 rounded-lg border cursor-pointer transition shadow-sm flex items-center space-x-1 ${
                                        item.paymentStatus === 'PAID'
                                          ? 'bg-red-950 hover:bg-red-800 text-red-300 border-red-600 shadow-red-950/40'
                                          : 'bg-slate-900 hover:bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
                                      }`}
                                      title={
                                        item.paymentStatus === 'PAID'
                                          ? 'Buka Invoice Resmi Wabup Cup 2026 (PDF Berstempel & TTD Ketua Panitia, Siap Kirim WA)'
                                          : 'Pratinjau Kuitansi / Invoice Pendaftaran Tim'
                                      }
                                    >
                                      <FileText className={`w-4 h-4 ${item.paymentStatus === 'PAID' ? 'text-red-400' : 'text-slate-400'}`} />
                                      <span className={`text-[10px] font-black px-0.5 ${item.paymentStatus === 'PAID' ? 'text-red-300' : 'text-slate-400'}`}>
                                        INV
                                      </span>
                                    </button>

                                    {/* Edit Data & Dokumen Pendaftar (Super Admin) */}
                                    <button
                                      onClick={() => handleOpenEditReg(item)}
                                      className="p-1.5 rounded-lg bg-blue-950 hover:bg-blue-800 text-blue-300 border border-blue-700 cursor-pointer"
                                      title="Edit Lengkap Data Pendaftar, Logo & Berkas"
                                    >
                                      <Edit className="w-4 h-4" />
                                    </button>

                                    {/* Hapus Registrasi (Super Admin, Panitia Inti & Panitia Umum) */}
                                    {canCrudRegistrations && (
                                      <button
                                        onClick={() => {
                                          if (confirm(`Hapus data pendaftaran tim ${item.teamName}? Tindakan ini tidak dapat dibatalkan.`)) {
                                            deleteRegistration(item.id);
                                          }
                                        }}
                                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-red-950 text-slate-400 hover:text-red-400 cursor-pointer"
                                        title="Hapus Registrasi"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    )}

                                  </div>
                                </td>

                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}

            </div>
          )}

          {/* TAB 6: SISTEM FASE GRUP & DRAG AND DROP KLASEMEN */}
          {activeTab === 'DRAWING_RANDOMIZER' && (
            <div className="space-y-6 animate-fadeIn">
              <GroupStageDragDropManager />
            </div>
          )}

          {/* TAB 7: KELOLA JADWAL, LIVE SCORE & OTOMATISASI KLASEMEN */}
          {activeTab === 'SCHEDULE_LIVESCORE' && (
            <div className="space-y-6 animate-fadeIn">
              <LiveScoreManagerTab />
            </div>
          )}

          {/* TAB BARU: MANAJEMEN DATA PEMAIN & IMPORT EXCEL */}
          {activeTab === 'PLAYER_MANAGER' && (
            <div className="space-y-6 animate-fadeIn">
              <PlayerManagerTab />
            </div>
          )}

          {/* TAB 8: KELOLA KATEGORI & TOTAL HADIAH (CRUD LENGKAP) */}
          {activeTab === 'CATEGORIES_PRIZES' && (
            <div className="space-y-6 animate-fadeIn">
              {/* TOAST URUTAN KATEGORI */}
              {categoryOrderToast && (
                <div className="fixed bottom-6 right-6 z-50 flex items-center space-x-3 bg-emerald-600 text-white px-5 py-3 rounded-2xl shadow-2xl border border-emerald-400 animate-fadeIn">
                  <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
                  <span className="text-xs font-bold">{categoryOrderToast}</span>
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-900 border border-slate-800">
                <div>
                  <h3 className="text-2xl font-heading font-bold uppercase tracking-wide text-white flex items-center space-x-2">
                    <Award className="w-6 h-6 text-red-500" />
                    <span>KELOLA KATEGORI & TOTAL HADIAH ({categories.length} KATEGORI)</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Tambah, edit rincian hadiah/regulasi, ubah kuota tim, biaya pendaftaran, atau susun posisi urutan kategori turnamen.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                  <div className="flex items-center space-x-1 p-1 rounded-xl bg-slate-950 border border-slate-800">
                    <button
                      type="button"
                      onClick={() => handleQuickSetRegistrationMode('INTERNAL_FORM')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer ${
                        regButtonMode === 'INTERNAL_FORM'
                          ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/40'
                          : 'text-slate-400 hover:text-white hover:bg-slate-900'
                      }`}
                      title="Mode Formulir Asli Sistem (Modal Bawaan)"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Form Asli</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!regCustomLink) {
                          setSettingsSubTab('VISIBILITY');
                          setActiveTab('SETTINGS');
                        } else {
                          handleQuickSetRegistrationMode('CUSTOM_LINK');
                        }
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer ${
                        regButtonMode === 'CUSTOM_LINK'
                          ? 'bg-cyan-600 text-white shadow-md shadow-cyan-950/40'
                          : 'text-slate-400 hover:text-white hover:bg-slate-900'
                      }`}
                      title={regCustomLink ? `Mode Tombol Samaran (Link: ${regCustomLink})` : 'Atur Link Tombol Samaran di Tab Pengaturan'}
                    >
                      <Globe className="w-3.5 h-3.5" />
                      <span>Tombol Samaran</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickSetRegistrationMode('HIDDEN')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer ${
                        regButtonMode === 'HIDDEN'
                          ? 'bg-rose-600 text-white shadow-md shadow-rose-950/40'
                          : 'text-slate-400 hover:text-white hover:bg-slate-900'
                      }`}
                      title="Sembunyikan Seluruh Tombol Daftar dari Publik"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>Sembunyi</span>
                    </button>
                  </div>

                  <button
                    onClick={handleOpenAddCategory}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white text-xs font-bold flex items-center justify-center space-x-2 transition shadow-lg shadow-red-950/50 cursor-pointer shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Tambah Kategori Baru</span>
                  </button>
                </div>
              </div>

              {/* BANNER DRAG & DROP & PANDUAN URUTAN */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-950/40 via-slate-900 to-slate-900 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-start space-x-3">
                  <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 shrink-0">
                    <GripVertical className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-xs uppercase flex items-center space-x-2">
                      <span>Pengaturan Urutan Tampilan Landing Page (Drag & Drop)</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        Interaktif
                      </span>
                    </h4>
                    <p className="text-slate-300 text-[11px] mt-0.5 leading-relaxed">
                      Pegang dan geser (<strong>drag & drop</strong>) kartu kategori atau gunakan tombol panah (<strong>↑ / ↓</strong>) untuk menyusun posisi urutan kartu pada bagian <em>Kategori & Hadiah</em> di Landing Page secara instan.
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2 shrink-0">
                  {isSavingCategoryOrder ? (
                    <span className="px-3 py-1.5 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] font-bold flex items-center space-x-1.5">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Menyimpan urutan...</span>
                    </span>
                  ) : (
                    <span className="px-3 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[11px] font-bold flex items-center space-x-1.5">
                      <Check className="w-3.5 h-3.5" />
                      <span>Sinkron Landing Page</span>
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {categories.map((c, idx) => {
                  const catRegs = registrations.filter(r => r.category === c.id && r.status !== 'REJECTED');
                  const count = catRegs.length;
                  const isFull = count >= c.maxTeams;
                  const remaining = Math.max(0, c.maxTeams - count);
                  const percent = Math.min(100, Math.round((count / c.maxTeams) * 100));

                  return (
                    <div
                      key={c.id}
                      draggable={canManageCategories}
                      onDragStart={e => handleCategoryDragStart(e, idx)}
                      onDragOver={e => handleCategoryDragOver(e, idx)}
                      onDrop={e => {
                        e.preventDefault();
                        handleCategoryDrop(idx);
                      }}
                      onDragEnd={() => {
                        setDraggedCategoryIndex(null);
                        setDragOverCategoryIndex(null);
                      }}
                      className={`p-6 rounded-2xl bg-slate-900 border shadow-xl space-y-4 flex flex-col justify-between transition-all duration-200 relative ${
                        draggedCategoryIndex === idx
                          ? 'opacity-40 border-amber-500 border-dashed scale-[0.98]'
                          : dragOverCategoryIndex === idx
                          ? 'border-amber-400 ring-2 ring-amber-400 ring-offset-2 ring-offset-slate-950 bg-slate-800/90 shadow-2xl'
                          : 'border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="space-y-4">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                          <div className="flex items-center space-x-2.5">
                            {/* GRIP & POSITION BADGE */}
                            <div
                              className="flex items-center space-x-1.5 px-2 py-1 rounded-lg bg-slate-950 border border-slate-800 hover:border-amber-500/50 cursor-grab active:cursor-grabbing text-slate-400 hover:text-amber-400 transition shrink-0"
                              title="Tahan & geser (drag & drop) untuk ubah urutan di landing page"
                            >
                              <GripVertical className="w-4 h-4 text-slate-400" />
                              <span className="text-[11px] font-mono font-bold text-amber-400">
                                #{idx + 1}
                              </span>
                            </div>

                            {/* STEP BUTTONS UP / DOWN */}
                            <div className="flex items-center space-x-0.5 bg-slate-950 border border-slate-800 rounded-lg p-0.5 shrink-0">
                              <button
                                type="button"
                                disabled={idx === 0}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMoveCategoryStep(idx, 'UP');
                                }}
                                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-slate-400 transition cursor-pointer"
                                title="Geser Naik (Sebelumnya)"
                              >
                                <ArrowUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={idx === categories.length - 1}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMoveCategoryStep(idx, 'DOWN');
                                }}
                                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-slate-400 transition cursor-pointer"
                                title="Geser Turun (Berikutnya)"
                              >
                                <ArrowDown className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            <span className="px-2.5 py-1 rounded-md bg-red-600 text-white font-bold text-xs shrink-0">
                              {c.id}
                            </span>
                            <h4 className="text-lg font-bold text-white">{c.name}</h4>
                          </div>

                          <div className="flex items-center space-x-2 shrink-0">
                            {isFull ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30 flex items-center space-x-1">
                                <Lock className="w-3 h-3 text-amber-400" />
                                <span>KUOTA PENUH</span>
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                {count}/{c.maxTeams} Tim ({remaining} Sisa)
                              </span>
                            )}

                            <button
                              onClick={() => handleOpenEditCategory(c)}
                              className="p-1.5 rounded-lg bg-blue-950/60 hover:bg-blue-900 text-blue-300 border border-blue-700/50 transition cursor-pointer"
                              title="Edit Lengkap Rincian Hadiah & Syarat"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() => handleDeleteCategoryPrompt(c.id, c.name)}
                              className="p-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-700/50 transition cursor-pointer"
                              title="Hapus Kategori"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* QUOTA BAR */}
                        <div>
                          <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                            <span>Slot Terisi ({count} dari {c.maxTeams} Tim)</span>
                            <span className={isFull ? 'text-red-400' : 'text-emerald-400'}>{percent}%</span>
                          </div>
                          <div className="w-full h-1.5 rounded-full bg-slate-950 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${isFull ? 'bg-red-500' : 'bg-emerald-500'}`}
                              style={{ width: `${percent}%` }}
                            ></div>
                          </div>
                        </div>

                        {/* GRID CONFIG */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                          <div>
                            <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">
                              Kuota Maksimal (Tim)
                            </label>
                            <input
                              type="number"
                              min={1}
                              value={c.maxTeams}
                              onChange={e => updateCategory({ ...c, maxTeams: Math.max(1, Number(e.target.value) || 1) })}
                              className="w-full bg-slate-950 border border-amber-500/40 focus:border-amber-400 rounded-lg px-3 py-1.5 text-amber-400 font-bold"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">
                              Total Hadiah (Rp)
                            </label>
                            <input
                              type="number"
                              value={c.totalPrize}
                              onChange={e => updateCategory({ ...c, totalPrize: Number(e.target.value) })}
                              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-red-400 font-bold"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">
                              Biaya Registrasi (Rp)
                            </label>
                            <input
                              type="number"
                              value={c.registrationFee}
                              onChange={e => updateCategory({ ...c, registrationFee: Number(e.target.value) })}
                              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-bold"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1">Syarat & Batasan Usia</label>
                          <input
                            type="text"
                            value={c.ageRestriction}
                            onChange={e => updateCategory({ ...c, ageRestriction: e.target.value })}
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-300"
                          />
                        </div>

                        {/* PRIZES LIST PREVIEW */}
                        <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1.5">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-bold text-slate-400 uppercase">Daftar Juara & Hadiah ({c.prizes.length})</span>
                            <button
                              type="button"
                              onClick={() => handleOpenEditCategory(c)}
                              className="text-amber-400 hover:underline font-semibold text-[10px]"
                            >
                              + Kelola Hadiah
                            </button>
                          </div>
                          <div className="space-y-1 text-xs">
                            {c.prizes.map((prz, idx) => (
                              <div key={idx} className="flex items-center justify-between text-[11px] text-slate-300">
                                <span>{prz.rank}</span>
                                <span className="font-mono text-emerald-400 font-bold">
                                  Rp {prz.prizeMoney.toLocaleString('id-ID')}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between">
                        <span className="text-[11px] text-slate-500">
                          {c.rules?.length || 0} Ketentuan Regulasi
                        </span>

                        <button
                          onClick={() => handleOpenEditCategory(c)}
                          className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold flex items-center space-x-1.5 cursor-pointer transition"
                        >
                          <Edit className="w-3.5 h-3.5 text-amber-400" />
                          <span>Edit Rincian Hadiah & Syarat</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 9: KELOLA SPONSOR (REQ #4 & #5) */}
          {activeTab === 'SPONSORS' && (
            <div className="space-y-6 animate-fadeIn">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-2xl font-heading font-bold uppercase tracking-wide text-white">
                    KELOLA SPONSOR & MITRA KERJASAMA
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Kelola sponsor turnamen: upload logo gambar, tautkan link website resmi, dan atur tingkatan sponsor.
                  </p>
                </div>
                <button
                  onClick={handleOpenAddSponsor}
                  className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white text-xs font-bold flex items-center justify-center space-x-2 transition shadow-lg shadow-red-950/40 cursor-pointer shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  <span>Tambah Sponsor Baru</span>
                </button>
              </div>

              {/* SPONSOR CARDS GRID */}
              {sponsors.length === 0 ? (
                <div className="p-12 text-center bg-slate-900/50 border border-slate-800 rounded-2xl">
                  <ImageIcon className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                  <h4 className="text-base font-bold text-white">Belum Ada Sponsor</h4>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                    Klik tombol Tambah Sponsor Baru di atas untuk menambahkan sponsor atau mitra resmi turnamen.
                  </p>
                  <button
                    onClick={handleOpenAddSponsor}
                    className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition"
                  >
                    Tambah Sponsor Sekarang
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {sponsors.map(sp => {
                    const tierBadgeColors: Record<SponsorTier, string> = {
                      PLATINUM: 'bg-red-600/20 text-red-400 border-red-500/30',
                      GOLD: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
                      SILVER: 'bg-slate-700 text-slate-200 border-slate-600',
                      OFFICIAL_PARTNER: 'bg-blue-600/20 text-blue-300 border-blue-500/30',
                    };

                    return (
                      <div
                        key={sp.id}
                        className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 transition flex flex-col justify-between shadow-xl space-y-4 group"
                      >
                        <div>
                          {/* TOP HEADER: TIER & ACTIONS */}
                          <div className="flex items-center justify-between mb-3">
                            <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${tierBadgeColors[sp.tier]}`}>
                              {sp.tier}
                            </span>
                            <div className="flex items-center space-x-1">
                              <button
                                onClick={() => handleOpenEditSponsor(sp)}
                                className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition"
                                title="Edit Sponsor"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => {
                                  if (confirm(`Yakin ingin menghapus sponsor "${sp.name}"?`)) {
                                    if (sp.logoUrl && sp.logoUrl.includes('/api/media/view/')) {
                                      deleteMediaFromStorage(sp.logoUrl).catch(() => {});
                                    }
                                    deleteSponsor(sp.id);
                                  }
                                }}
                                className="p-1.5 rounded-lg bg-slate-800 text-rose-400 hover:text-white hover:bg-rose-600 transition"
                                title="Hapus Sponsor"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* LOGO PREVIEW BOX */}
                          <div className="w-full h-24 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center p-3 mb-3 overflow-hidden group-hover:border-slate-700 transition">
                            {sp.logoUrl ? (
                              <img loading="lazy"
                                src={sp.logoUrl}
                                alt={sp.name}
                                referrerPolicy="no-referrer"
                                className="max-h-16 max-w-full object-contain filter drop-shadow"
                                onError={(e) => {
                                  // Fallback if image load fails
                                  (e.target as HTMLElement).style.display = 'none';
                                }}
                              />
                            ) : (
                              <div className="flex items-center space-x-2">
                                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-red-600 to-blue-700 flex items-center justify-center font-bold text-sm text-white shadow">
                                  {(sp.logoText || sp.name).slice(0, 2).toUpperCase()}
                                </div>
                                <span className="font-mono text-xs font-bold text-slate-300 tracking-wider">
                                  {sp.logoText || sp.name}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* SPONSOR INFO */}
                          <div className="space-y-1">
                            <h4 className="font-bold text-base text-white leading-tight group-hover:text-red-400 transition-colors">
                              {sp.name}
                            </h4>
                            <p className="text-xs text-slate-400 line-clamp-2">
                              {sp.description || 'Mitra Resmi Turnamen'}
                            </p>
                          </div>
                        </div>

                        {/* BOTTOM LINK & QUICK EDIT */}
                        <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                          {sp.websiteUrl ? (
                            <a
                              href={sp.websiteUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center space-x-1 text-xs font-semibold text-blue-400 hover:text-blue-300 transition truncate max-w-[200px]"
                            >
                              <Globe className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">{sp.websiteUrl.replace(/^https?:\/\//i, '')}</span>
                              <ExternalLink className="w-3 h-3 shrink-0" />
                            </a>
                          ) : (
                            <span className="text-xs text-slate-500 italic">Tanpa tautan web</span>
                          )}

                          <button
                            onClick={() => handleOpenEditSponsor(sp)}
                            className="text-xs font-bold text-slate-400 hover:text-white transition"
                          >
                            Edit
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 10: KELOLA ADMIN USERS (HANYA SUPERADMIN) */}
          {activeTab === 'ADMIN_USERS' && (
            isSuperAdmin ? (
              <AdminUsersManagerTab />
            ) : (
              <div className="p-8 rounded-3xl bg-slate-900 border border-slate-800 text-center space-y-4 max-w-lg mx-auto mt-12">
                <div className="w-14 h-14 rounded-2xl bg-red-500/20 text-red-400 flex items-center justify-center mx-auto">
                  <Lock className="w-7 h-7" />
                </div>
                <h4 className="text-lg font-bold text-white">Akses Dibatasi: Khusus Super Admin</h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Menu Kelola Admin Users hanya dapat diakses dan dikelola oleh Super Administrator demi menjaga keamanan hak akses akun.
                </p>
                <button
                  onClick={() => setActiveTab('OVERVIEW')}
                  className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition"
                >
                  Kembali ke Ringkasan
                </button>
              </div>
            )
          )}

          {/* TAB: DATABASE MYSQL & HOSTING VERCEL (HANYA SUPERADMIN) */}
          {activeTab === 'MYSQL_DATABASE_MANAGER' && (
            isSuperAdmin ? (
              <DatabaseManagerTab />
            ) : (
              <div className="p-8 rounded-3xl bg-slate-900 border border-slate-800 text-center space-y-4 max-w-lg mx-auto mt-12">
                <div className="w-14 h-14 rounded-2xl bg-red-500/20 text-red-400 flex items-center justify-center mx-auto">
                  <Lock className="w-7 h-7" />
                </div>
                <h4 className="text-lg font-bold text-white">Akses Dibatasi: Khusus Super Admin</h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Menu Manajemen Database hanya dapat diakses oleh Super Administrator untuk memelihara integritas data turnamen.
                </p>
                <button
                  onClick={() => setActiveTab('OVERVIEW')}
                  className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition"
                >
                  Kembali ke Ringkasan
                </button>
              </div>
            )
          )}

          {/* TAB 11: GOOGLE APPS SCRIPT 3-FILE HUB & DEPLOYMENT GUIDE */}
          {activeTab === 'GAS_EXPORT_GUIDE' && (
            <div className="space-y-6 animate-fadeIn">
              <div>
                <h3 className="text-2xl sm:text-3xl font-heading font-bold uppercase tracking-wide flex items-center space-x-2">
                  <FileCode className="w-6 h-6 text-amber-400" />
                  <span>ARSITEKTUR 3-FILE GOOGLE APPS SCRIPT & PANDUAN DEPLOYMENT</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Kode 100% lengkap tanpa potongan untuk database Google Sheets, backend Drive API, dan frontend SPA mandiri.
                </p>
              </div>

              {/* FILE SELECTOR TABS & ACTION BUTTONS */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-slate-900 border border-slate-800">
                <div className="flex items-center space-x-2 overflow-x-auto">
                  {(['setup.gs', 'Code.gs', 'Index.html', 'Panduan_Deploy'] as const).map(fileName => (
                    <button
                      key={fileName}
                      onClick={() => setGasActiveFile(fileName)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                        gasActiveFile === fileName
                          ? 'bg-red-600 text-white shadow-md'
                          : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                      }`}
                    >
                      {fileName === 'setup.gs' && '1. setup.gs (Database Sheets)'}
                      {fileName === 'Code.gs' && '2. Code.gs (Backend API & Drive)'}
                      {fileName === 'Index.html' && '3. Index.html (Frontend SPA)'}
                      {fileName === 'Panduan_Deploy' && '📖 Panduan Deploy & Git'}
                    </button>
                  ))}
                </div>

                <div className="flex items-center space-x-2 shrink-0">
                  <button
                    onClick={handleCopyGasCode}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white transition flex items-center space-x-1.5"
                  >
                    <Copy className="w-3.5 h-3.5 text-amber-400" />
                    <span>{copiedGas ? 'Tersalin ke Clipboard!' : 'Salin Kode'}</span>
                  </button>

                  <button
                    onClick={handleDownloadGasFile}
                    className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-xs font-bold text-white transition flex items-center space-x-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download File</span>
                  </button>
                </div>
              </div>

              {/* CODE DISPLAY BOX */}
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 font-mono text-xs text-slate-300 overflow-x-auto max-h-[600px] shadow-2xl leading-relaxed">
                <pre className="whitespace-pre">
                  {gasActiveFile === 'setup.gs' && SETUP_GS_CODE}
                  {gasActiveFile === 'Code.gs' && CODE_GS_CODE}
                  {gasActiveFile === 'Index.html' && INDEX_HTML_STANDALONE_TEMPLATE}
                  {gasActiveFile === 'Panduan_Deploy' && DEPLOYMENT_AND_GIT_GUIDE}
                </pre>
              </div>
            </div>
          )}

          {/* TAB 12: SETTINGS (BERKAS, WA, EMAIL, REKENING, PENGATURAN UMUM) */}
          {activeTab === 'SETTINGS' && (
            <div className="space-y-6 animate-fadeIn">
              {/* SETTINGS HEADER */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <div>
                  <h3 className="text-2xl font-bold tracking-tight text-white uppercase flex items-center space-x-2.5">
                    <Settings className="w-6 h-6 text-cyan-400" />
                    <span>Pusat Pengaturan Sistem & Berkas</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Kelola berkas unduhan publik, kontak WhatsApp panitia, email resmi, rekening bank pembayaran, dan informasi umum turnamen.
                  </p>
                </div>

                <div className="flex items-center space-x-2">
                  <span className="px-3 py-1 rounded-lg bg-slate-900 border border-slate-800 text-[11px] font-mono text-cyan-400">
                    Auto-Sync LocalStorage & Landing Page
                  </span>
                </div>
              </div>

              {/* SETTINGS SUB-NAV TABS */}
              <div className="flex items-center space-x-2 overflow-x-auto pb-2 border-b border-slate-800/80">
                <button
                  onClick={() => setSettingsSubTab('DOCS')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 whitespace-nowrap cursor-pointer ${
                    settingsSubTab === 'DOCS'
                      ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-900/30'
                      : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-white border border-slate-800'
                  }`}
                >
                  <FolderDown className="w-4 h-4" />
                  <span>1. Berkas Unduhan ({downloadableDocs.length})</span>
                </button>

                <button
                  onClick={() => setSettingsSubTab('WHATSAPP')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 whitespace-nowrap cursor-pointer ${
                    settingsSubTab === 'WHATSAPP'
                      ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/30'
                      : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-white border border-slate-800'
                  }`}
                >
                  <Phone className="w-4 h-4" />
                  <span>2. Kontak WhatsApp ({committeeContacts.length})</span>
                </button>

                <button
                  onClick={() => setSettingsSubTab('EMAIL')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 whitespace-nowrap cursor-pointer ${
                    settingsSubTab === 'EMAIL'
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30'
                      : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-white border border-slate-800'
                  }`}
                >
                  <Mail className="w-4 h-4" />
                  <span>3. Email Panitia ({committeeEmails.length})</span>
                </button>

                <button
                  onClick={() => setSettingsSubTab('BANK')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 whitespace-nowrap cursor-pointer ${
                    settingsSubTab === 'BANK'
                      ? 'bg-amber-600 text-white shadow-lg shadow-amber-900/30'
                      : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-white border border-slate-800'
                  }`}
                >
                  <CreditCard className="w-4 h-4" />
                  <span>4. Rekening Bank ({bankAccounts.length})</span>
                </button>

                <button
                  onClick={() => setSettingsSubTab('QUOTA')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 whitespace-nowrap cursor-pointer ${
                    settingsSubTab === 'QUOTA'
                      ? 'bg-amber-600 text-white shadow-lg shadow-amber-900/30'
                      : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-white border border-slate-800'
                  }`}
                >
                  <Sliders className="w-4 h-4 text-amber-300" />
                  <span>5. Kuota Kategori ({categories.length})</span>
                </button>

                <button
                  onClick={() => setSettingsSubTab('VISIBILITY')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 whitespace-nowrap cursor-pointer ${
                    settingsSubTab === 'VISIBILITY'
                      ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/30'
                      : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-white border border-slate-800'
                  }`}
                >
                  <Eye className="w-4 h-4 text-purple-300" />
                  <span>6. Visibilitas Landing Page & Standalone</span>
                </button>

                <button
                  onClick={() => setSettingsSubTab('BACKGROUNDS')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 whitespace-nowrap cursor-pointer ${
                    settingsSubTab === 'BACKGROUNDS'
                      ? 'bg-gradient-to-r from-rose-600 to-pink-600 text-white shadow-lg shadow-rose-900/30'
                      : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-white border border-slate-800'
                  }`}
                >
                  <Palette className="w-4 h-4 text-pink-300" />
                  <span>7. Background & Hero Image Tiap Section</span>
                </button>

                <button
                  onClick={() => setSettingsSubTab('SIGNATURE_STAMP')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 whitespace-nowrap cursor-pointer ${
                    settingsSubTab === 'SIGNATURE_STAMP'
                      ? 'bg-red-700 text-white shadow-lg shadow-red-900/30'
                      : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-white border border-slate-800'
                  }`}
                >
                  <FileText className="w-4 h-4 text-red-300" />
                  <span>8. TTD Ketua & Cap Turnamen</span>
                </button>

                <button
                  onClick={() => setSettingsSubTab('GENERAL')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 whitespace-nowrap cursor-pointer ${
                    settingsSubTab === 'GENERAL'
                      ? 'bg-cyan-700 text-white shadow-lg shadow-cyan-900/30'
                      : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-white border border-slate-800'
                  }`}
                >
                  <Building className="w-4 h-4" />
                  <span>9. Informasi Turnamen & Logo</span>
                </button>
              </div>

              {/* SUB-TAB 1: DOKUMEN UNDUHAN PUBLIK */}
              {settingsSubTab === 'DOCS' && (
                <div className="space-y-5 animate-fadeIn">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-slate-900/70 border border-slate-800">
                    <div>
                      <h4 className="text-sm font-bold text-white uppercase flex items-center space-x-2">
                        <FolderDown className="w-4 h-4 text-cyan-400" />
                        <span>Daftar Berkas & Dokumen Resmi Turnamen</span>
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Berkas ini dapat diunduh oleh calon pendaftar di Footer, Hero, dan Form Pendaftaran.
                      </p>
                    </div>

                    <button
                      onClick={handleOpenAddDoc}
                      className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition flex items-center space-x-1.5 shadow-lg shadow-cyan-950/60 shrink-0 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Tambah Berkas Baru</span>
                    </button>
                  </div>

                  {downloadableDocs.length === 0 ? (
                    <div className="p-12 text-center rounded-2xl bg-slate-900/40 border border-slate-800 space-y-3">
                      <FolderDown className="w-12 h-12 text-slate-600 mx-auto" />
                      <p className="text-sm font-bold text-slate-300">Belum ada berkas unduhan yang terdaftar</p>
                      <p className="text-xs text-slate-500 max-w-sm mx-auto">
                        Klik tombol di atas untuk mengunggah formulir pendaftaran, regulasi teknis, atau template surat.
                      </p>
                      <button
                        onClick={handleOpenAddDoc}
                        className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition inline-flex items-center space-x-1.5"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Tambah Berkas Pertama</span>
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {downloadableDocs.map(doc => (
                        <div
                          key={doc.id}
                          className={`p-5 rounded-2xl bg-slate-900 border transition flex flex-col justify-between space-y-4 hover:border-slate-700 ${
                            doc.isPrimary ? 'border-cyan-500/40 shadow-lg shadow-cyan-950/20' : 'border-slate-800'
                          }`}
                        >
                          <div className="space-y-2.5">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center space-x-2">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                                    doc.fileType === 'PDF'
                                      ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                                      : doc.fileType === 'DOCX'
                                      ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                      : doc.fileType === 'XLSX'
                                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                      : doc.fileType === 'ZIP'
                                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                      : 'bg-slate-700 text-slate-300'
                                  }`}
                                >
                                  {doc.fileType}
                                </span>
                                {doc.isPrimary && (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                                    ⭐ Utama
                                  </span>
                                )}
                              </div>

                              <span className="text-[10px] text-slate-400 font-mono">
                                {doc.fileSize}
                              </span>
                            </div>

                            <div>
                              <h5 className="font-bold text-sm text-white leading-snug">
                                {doc.title}
                              </h5>
                              <p className="text-[11px] text-cyan-400/90 font-medium mt-0.5">
                                {doc.category || 'Dokumen Umum'}
                              </p>
                              {doc.description && (
                                <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                                  {doc.description}
                                </p>
                              )}
                            </div>

                            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-400 font-mono truncate">
                              📁 {doc.fileName}
                            </div>
                          </div>

                          <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-2">
                            <a
                              href={doc.fileUrl ? (doc.fileUrl.includes('?') ? `${doc.fileUrl}&download=1` : `${doc.fileUrl}?download=1`) : '#'}
                              target="_blank"
                              rel="noopener noreferrer"
                              download={doc.fileName}
                              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-cyan-300 transition flex items-center space-x-1.5 cursor-pointer"
                              title="Test Unduh Berkas"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>Test Unduh</span>
                            </a>

                            <div className="flex items-center space-x-1.5">
                              <button
                                onClick={() => handleOpenEditDoc(doc)}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                                title="Edit Berkas"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => {
                                  if (confirm(`Hapus berkas "${doc.title}"?`)) {
                                    if (doc.fileUrl && doc.fileUrl.includes('/api/media/view/')) {
                                      deleteMediaFromStorage(doc.fileUrl).catch(() => {});
                                    }
                                    deleteDownloadableDoc(doc.id);
                                  }
                                }}
                                className="p-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900 text-rose-300 transition cursor-pointer"
                                title="Hapus Berkas"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* SUB-TAB 2: KONTAK WHATSAPP PANITIA */}
              {settingsSubTab === 'WHATSAPP' && (
                <div className="space-y-5 animate-fadeIn">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-slate-900/70 border border-slate-800">
                    <div>
                      <h4 className="text-sm font-bold text-white uppercase flex items-center space-x-2">
                        <Phone className="w-4 h-4 text-emerald-400" />
                        <span>Daftar Nomor WhatsApp Resmi Panitia</span>
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Kontak WhatsApp berlabel <strong className="text-emerald-400">Utama</strong> akan digunakan pada tombol konfirmasi pendaftaran, notifikasi, dan floating chat.
                      </p>
                    </div>

                    <button
                      onClick={handleOpenAddContact}
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center space-x-1.5 shadow-lg shadow-emerald-950/60 shrink-0 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Tambah Kontak WA</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {committeeContacts.map(c => {
                      const clean = c.phone.replace(/\D/g, '');
                      const formattedWa = clean.startsWith('0') ? `62${clean.slice(1)}` : clean;
                      return (
                        <div
                          key={c.id}
                          className={`p-5 rounded-2xl bg-slate-900 border transition flex flex-col justify-between space-y-4 ${
                            c.isPrimary ? 'border-emerald-500/50 shadow-lg shadow-emerald-950/20' : 'border-slate-800'
                          }`}
                        >
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300 font-mono">
                                {c.role}
                              </span>
                              {c.isPrimary ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                  ⭐ Kontak Utama
                                </span>
                              ) : (
                                <button
                                  onClick={() => setPrimaryCommitteeContact(c.id)}
                                  className="text-[10px] text-slate-400 hover:text-emerald-400 underline cursor-pointer"
                                >
                                  Set Jadi Utama
                                </button>
                              )}
                            </div>

                            <div>
                              <h5 className="font-bold text-sm text-white">
                                {c.name}
                              </h5>
                              <p className="font-mono text-xs text-emerald-400 font-semibold mt-0.5">
                                📞 {c.phone}
                              </p>
                            </div>
                          </div>

                          <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                            <a
                              href={`https://wa.me/${formattedWa}?text=${encodeURIComponent('Halo Panitia WabupCup 2026, saya ingin bertanya seputar turnamen...')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 text-xs font-semibold transition flex items-center space-x-1.5 cursor-pointer"
                            >
                              <Phone className="w-3.5 h-3.5" />
                              <span>Test Chat WA</span>
                            </a>

                            <div className="flex items-center space-x-1.5">
                              <button
                                onClick={() => handleOpenEditContact(c)}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                                title="Edit Kontak"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              {committeeContacts.length > 1 && (
                                <button
                                  onClick={() => {
                                    if (confirm(`Hapus kontak "${c.name}"?`)) {
                                      deleteCommitteeContact(c.id);
                                    }
                                  }}
                                  className="p-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900 text-rose-300 transition cursor-pointer"
                                  title="Hapus Kontak"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* SUB-TAB 3: EMAIL RESMI PANITIA */}
              {settingsSubTab === 'EMAIL' && (
                <div className="space-y-5 animate-fadeIn">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-slate-900/70 border border-slate-800">
                    <div>
                      <h4 className="text-sm font-bold text-white uppercase flex items-center space-x-2">
                        <Mail className="w-4 h-4 text-blue-400" />
                        <span>Daftar Email Resmi Panitia</span>
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Alamat email resmi untuk korespondensi surat undangan, rekomendasi, dan pertanyaan resmi peserta.
                      </p>
                    </div>

                    <button
                      onClick={handleOpenAddEmail}
                      className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition flex items-center space-x-1.5 shadow-lg shadow-blue-950/60 shrink-0 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Tambah Email Panitia</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {committeeEmails.map(em => (
                      <div
                        key={em.id}
                        className={`p-5 rounded-2xl bg-slate-900 border transition flex flex-col justify-between space-y-4 ${
                          em.isPrimary ? 'border-blue-500/50 shadow-lg shadow-blue-950/20' : 'border-slate-800'
                        }`}
                      >
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-white">
                              {em.title}
                            </span>
                            {em.isPrimary ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                                ⭐ Email Utama
                              </span>
                            ) : (
                              <button
                                onClick={() => {
                                  updateCommitteeEmail({ ...em, isPrimary: true });
                                }}
                                className="text-[10px] text-slate-400 hover:text-blue-400 underline cursor-pointer"
                              >
                                Set Jadi Utama
                              </button>
                            )}
                          </div>

                          <p className="font-mono text-xs text-blue-400 font-semibold">
                            ✉️ {em.email}
                          </p>
                        </div>

                        <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                          <a
                            href={`mailto:${em.email}?subject=${encodeURIComponent('Pertanyaan Turnamen WabupCup 2026')}`}
                            className="px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 text-xs font-semibold transition flex items-center space-x-1.5 cursor-pointer"
                          >
                            <Mail className="w-3.5 h-3.5" />
                            <span>Kirim Email</span>
                          </a>

                          <div className="flex items-center space-x-1.5">
                            <button
                              onClick={() => handleOpenEditEmail(em)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                              title="Edit Email"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            {committeeEmails.length > 1 && (
                              <button
                                onClick={() => {
                                  if (confirm(`Hapus email "${em.email}"?`)) {
                                    deleteCommitteeEmail(em.id);
                                  }
                                }}
                                className="p-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900 text-rose-300 transition cursor-pointer"
                                title="Hapus Email"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* SUB-TAB 4: REKENING BANK & PEMBAYARAN */}
              {settingsSubTab === 'BANK' && (
                <div className="space-y-5 animate-fadeIn">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-slate-900/70 border border-slate-800">
                    <div>
                      <h4 className="text-sm font-bold text-white uppercase flex items-center space-x-2">
                        <CreditCard className="w-4 h-4 text-amber-400" />
                        <span>Rekening Bank & Opsi Pembayaran Resmi</span>
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Rekening bank berstatus <strong className="text-amber-400">Utama</strong> akan tercantum pada form registrasi dan pesan WA otomatis ke manajer tim.
                      </p>
                    </div>

                    <button
                      onClick={handleOpenAddBank}
                      className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition flex items-center space-x-1.5 shadow-lg shadow-amber-950/60 shrink-0 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Tambah Rekening Bank</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {bankAccounts.map(b => (
                      <div
                        key={b.id}
                        className={`p-5 rounded-2xl bg-slate-900 border transition flex flex-col justify-between space-y-4 ${
                          b.isPrimary ? 'border-amber-500/50 shadow-lg shadow-amber-950/20' : 'border-slate-800'
                        }`}
                      >
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              {b.bankName}
                            </span>
                            {b.isPrimary ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                ⭐ Rekening Utama
                              </span>
                            ) : (
                              <button
                                onClick={() => setPrimaryBankAccount(b.id)}
                                className="text-[10px] text-slate-400 hover:text-amber-400 underline cursor-pointer"
                              >
                                Set Jadi Utama
                              </button>
                            )}
                          </div>

                          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-slate-400 uppercase tracking-wider">No. Rekening</span>
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(b.accountNumber);
                                  alert(`Nomor rekening ${b.accountNumber} berhasil disalin!`);
                                }}
                                className="text-[10px] text-amber-400 hover:underline flex items-center space-x-1 cursor-pointer"
                              >
                                <Copy className="w-3 h-3" />
                                <span>Salin</span>
                              </button>
                            </div>
                            <p className="font-mono text-base font-bold text-white tracking-wider">
                              {b.accountNumber}
                            </p>
                            <p className="text-xs text-slate-300 font-semibold">
                              a/n {b.accountHolder}
                            </p>
                            {b.branchName && (
                              <p className="text-[10px] text-slate-400">
                                Cabang: {b.branchName}
                              </p>
                            )}
                          </div>

                          {b.instructions && (
                            <p className="text-xs text-slate-400 leading-relaxed italic">
                              "{b.instructions}"
                            </p>
                          )}
                        </div>

                        <div className="pt-2 border-t border-slate-800 flex items-center justify-end space-x-1.5">
                          <button
                            onClick={() => handleOpenEditBank(b)}
                            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition flex items-center space-x-1.5 cursor-pointer"
                          >
                            <Edit className="w-3.5 h-3.5" />
                            <span>Edit</span>
                          </button>
                          {bankAccounts.length > 1 && (
                            <button
                              onClick={() => {
                                if (confirm(`Hapus rekening bank "${b.bankName} - ${b.accountNumber}"?`)) {
                                  deleteBankAccount(b.id);
                                }
                              }}
                              className="p-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900 text-rose-300 transition cursor-pointer"
                              title="Hapus Rekening"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* SUB-TAB 5: KUOTA PENDAFTARAN & KATEGORI TURNAMEN */}
              {settingsSubTab === 'QUOTA' && (
                <div className="space-y-6 animate-fadeIn">
                  {/* HEADER BANNER */}
                  <div className="p-5 rounded-2xl bg-gradient-to-r from-amber-950/40 via-slate-900 to-slate-900 border border-amber-500/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <h4 className="text-sm font-bold text-white uppercase flex items-center space-x-2">
                        <Sliders className="w-4 h-4 text-amber-400" />
                        <span>Pengaturan Kuota Pendaftaran & Kategori Turnamen</span>
                      </h4>
                      <p className="text-xs text-slate-300">
                        Atur batas maksimal kuota tim (<code className="text-amber-300 font-mono">maxTeams</code>), biaya registrasi, total hadiah, dan syarat batasan usia untuk masing-masing kategori.
                      </p>
                      <p className="text-[11px] text-amber-400/90 flex items-center space-x-1.5 pt-0.5">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>Kategori yang kuotanya telah penuh akan otomatis disembunyikan dari formulir pendaftaran peserta di halaman publik.</span>
                      </p>
                    </div>

                    {quotaSaveSuccess && (
                      <span className="px-3.5 py-2 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold flex items-center space-x-1.5 animate-fadeIn shrink-0 shadow-lg shadow-emerald-950/40">
                        <Check className="w-4 h-4" />
                        <span>Pengaturan Kuota Tersimpan!</span>
                      </span>
                    )}
                  </div>

                  {/* GLOBAL REGISTRATION BUTTON STATUS & 3-MODE CONTROL BANNER */}
                  {(() => {
                    const mode = regButtonMode;
                    const isCustom = mode === 'CUSTOM_LINK';
                    const isHidden = mode === 'HIDDEN';
                    const isInternal = mode === 'INTERNAL_FORM';

                    return (
                      <div className={`p-4 sm:p-5 rounded-2xl border transition-all duration-200 flex flex-col gap-4 shadow-lg ${
                        isInternal
                          ? 'bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-900 border-emerald-500/30'
                          : isCustom
                          ? 'bg-gradient-to-r from-cyan-950/40 via-slate-900 to-slate-900 border-cyan-500/30'
                          : 'bg-gradient-to-r from-rose-950/40 via-slate-900 to-slate-900 border-rose-500/30'
                      }`}>
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div className="flex items-start space-x-3.5">
                            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border ${
                              isInternal
                                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                : isCustom
                                ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'
                                : 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                            }`}>
                              {isInternal ? <UserPlus className="w-5 h-5" /> : isCustom ? <Globe className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
                            </div>
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <h4 className="font-bold text-sm sm:text-base text-white">
                                  Mode Pendaftaran & Tombol Daftar Tim di Halaman Publik
                                </h4>
                                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                                  isInternal
                                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                    : isCustom
                                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                                    : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                                }`}>
                                  {isInternal ? 'FORMULIR ASLI SISTEM' : isCustom ? 'TOMBOL SAMARAN (LINK KUSTOM)' : 'DISEMBUNYIKAN TOTAL'}
                                </span>
                              </div>
                              <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
                                {isInternal
                                  ? 'Tombol membuka formulir pendaftaran modal sistem asli turnamen (dengan validasi kuota otomatis dan upload berkas).'
                                  : isCustom
                                  ? `Tombol tetap aktif di Navbar, Hero, Kategori, & Bagan namun mengarahkan pengunjung ke tautan khusus: ${regCustomLink || '(Belum ada link, isi di bawah)'}.`
                                  : 'Seluruh tombol "Daftar Tim" disembunyikan dari publik. Calon peserta tidak dapat mendaftar dari halaman depan.'}
                              </p>
                            </div>
                          </div>

                          {/* 3 MODE SELECTOR BUTTONS */}
                          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-950/80 border border-slate-800 shrink-0 self-start md:self-center">
                            <button
                              type="button"
                              onClick={() => handleQuickSetRegistrationMode('INTERNAL_FORM')}
                              className={`px-3 py-2 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer ${
                                isInternal
                                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/40'
                                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
                              }`}
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Form Asli</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleQuickSetRegistrationMode('CUSTOM_LINK')}
                              className={`px-3 py-2 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer ${
                                isCustom
                                  ? 'bg-cyan-600 text-white shadow-md shadow-cyan-950/40'
                                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
                              }`}
                            >
                              <Globe className="w-3.5 h-3.5" />
                              <span>Tombol Samaran</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleQuickSetRegistrationMode('HIDDEN')}
                              className={`px-3 py-2 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer ${
                                isHidden
                                  ? 'bg-rose-600 text-white shadow-md shadow-rose-950/40'
                                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
                              }`}
                            >
                              <Lock className="w-3.5 h-3.5" />
                              <span>Sembunyi</span>
                            </button>
                          </div>
                        </div>

                        {/* INLINE LINK INPUT IF CUSTOM_LINK */}
                        {isCustom && (
                          <div className="pt-3 border-t border-slate-800/80 flex flex-col md:flex-row items-stretch md:items-end gap-3 bg-slate-950/60 p-3.5 rounded-xl border border-cyan-500/20">
                            <div className="flex-1 space-y-1">
                              <label className="text-[11px] font-bold text-cyan-300 uppercase tracking-wider flex items-center space-x-1.5">
                                <LinkIcon className="w-3 h-3" />
                                <span>URL Link Tautan Tombol Samaran:</span>
                              </label>
                              <input
                                type="url"
                                value={regCustomLink}
                                onChange={e => setRegCustomLink(e.target.value)}
                                placeholder="https://forms.gle/... atau https://wa.me/628123456789..."
                                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 font-mono"
                              />
                            </div>

                            <div className="w-full md:w-64 space-y-1">
                              <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                                Teks Label Tombol (Opsional):
                              </label>
                              <input
                                type="text"
                                value={regCustomBtnText}
                                onChange={e => setRegCustomBtnText(e.target.value)}
                                placeholder="Daftar via Google Form..."
                                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                              />
                            </div>

                            <div className="flex items-center space-x-2 shrink-0">
                              {regCustomLink && (
                                <a
                                  href={formatExternalLink(regCustomLink)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-bold transition flex items-center space-x-1 cursor-pointer"
                                  title="Tes buka tautan di tab baru"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                  <span>Uji Link</span>
                                </a>
                              )}
                              <button
                                type="button"
                                onClick={() => handleSaveRegistrationButtonSettings('CUSTOM_LINK', regCustomLink, regCustomBtnText, regCustomNewTab)}
                                className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition flex items-center space-x-1.5 shadow-md shadow-cyan-950/40 cursor-pointer"
                              >
                                <Save className="w-3.5 h-3.5" />
                                <span>Simpan Link</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* SUMMARY STATS ROW */}
                  {(() => {
                    let totalMax = 0;
                    let totalReg = 0;
                    let fullCount = 0;

                    categories.forEach(c => {
                      const count = registrations.filter(r => r.category === c.id && r.status !== 'REJECTED').length;
                      totalMax += c.maxTeams;
                      totalReg += count;
                      if (count >= c.maxTeams) fullCount++;
                    });

                    const totalRemaining = Math.max(0, totalMax - totalReg);
                    const overallPercent = totalMax > 0 ? Math.round((totalReg / totalMax) * 100) : 0;

                    return (
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Kuota Turnamen</span>
                          <p className="text-2xl font-black text-white font-mono">{totalMax} <span className="text-xs font-normal text-slate-400">Tim</span></p>
                          <span className="text-[11px] text-slate-400 block">{categories.length} Kategori Turnamen</span>
                        </div>

                        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Total Tim Terdaftar</span>
                          <p className="text-2xl font-black text-emerald-400 font-mono">{totalReg} <span className="text-xs font-normal text-slate-400">Tim</span></p>
                          <span className="text-[11px] text-emerald-400/80 block">{overallPercent}% Terisi</span>
                        </div>

                        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">Sisa Kuota Tersedia</span>
                          <p className="text-2xl font-black text-cyan-400 font-mono">{totalRemaining} <span className="text-xs font-normal text-slate-400">Slot</span></p>
                          <span className="text-[11px] text-cyan-400/80 block">Slot Masih Terbuka</span>
                        </div>

                        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">Kategori Kuota Penuh</span>
                          <p className="text-2xl font-black text-amber-400 font-mono">{fullCount} <span className="text-xs font-normal text-slate-400">/ {categories.length}</span></p>
                          <span className="text-[11px] text-amber-400/80 block">{fullCount > 0 ? `${fullCount} ditutup sementara` : 'Semua kategori buka'}</span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* CATEGORIES QUOTA LIST */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {categories.map(cat => {
                      const activeRegs = registrations.filter(r => r.category === cat.id && r.status !== 'REJECTED');
                      const regCount = activeRegs.length;
                      const isFull = regCount >= cat.maxTeams;
                      const remaining = Math.max(0, cat.maxTeams - regCount);
                      const percent = Math.min(100, Math.round((regCount / cat.maxTeams) * 100));

                      const presets = [8, 12, 16, 24, 32, 48, 64];

                      return (
                        <div
                          key={cat.id}
                          className={`p-6 rounded-2xl bg-slate-900 border transition shadow-xl space-y-5 ${
                            isFull ? 'border-red-500/50 shadow-red-950/20' : 'border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          {/* CATEGORY TITLE & STATUS BADGE */}
                          <div className="flex items-center justify-between pb-3 border-b border-slate-800 gap-2">
                            <div className="flex items-center space-x-2">
                              <span className="px-2.5 py-1 rounded-lg bg-red-600 text-white font-bold text-xs tracking-wider">
                                {cat.id}
                              </span>
                              <h5 className="font-bold text-base text-white">{cat.name}</h5>
                            </div>

                            {isFull ? (
                              <span className="px-2.5 py-1 rounded-lg bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-bold flex items-center space-x-1.5">
                                <Lock className="w-3.5 h-3.5 text-red-400" />
                                <span>KUOTA PENUH</span>
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold">
                                {regCount} / {cat.maxTeams} Tim ({remaining} Sisa)
                              </span>
                            )}
                          </div>

                          {/* LIVE STATUS PROGRESS BAR */}
                          <div className="space-y-1.5">
                            <div className="flex justify-between text-xs text-slate-400">
                              <span className="font-semibold text-slate-300">
                                {regCount} Tim Terdaftar dari Kuota {cat.maxTeams} Tim
                              </span>
                              <span className={`font-mono font-bold ${isFull ? 'text-red-400' : 'text-emerald-400'}`}>
                                {percent}% Terisi
                              </span>
                            </div>
                            <div className="w-full h-2 rounded-full bg-slate-950 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${
                                  isFull ? 'bg-red-500' : percent >= 75 ? 'bg-amber-500' : 'bg-emerald-500'
                                }`}
                                style={{ width: `${percent}%` }}
                              ></div>
                            </div>
                            {isFull && (
                              <p className="text-[11px] text-red-400/90 font-medium flex items-center space-x-1 pt-1">
                                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                <span>Kategori ini otomatis tidak muncul di dropdown formulir pendaftaran publik.</span>
                              </p>
                            )}
                          </div>

                          {/* FORM FIELDS */}
                          <div className="space-y-4 pt-1">
                            {/* KUOTA MAKSIMAL & PRESETS */}
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <label className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center space-x-1.5">
                                  <Sliders className="w-3.5 h-3.5" />
                                  <span>Batas Kuota Maksimal Tim</span>
                                </label>
                                <span className="text-[11px] text-slate-400">Pilih Preset Cepat:</span>
                              </div>

                              <div className="flex items-center space-x-3">
                                <input
                                  type="number"
                                  min={1}
                                  max={128}
                                  value={cat.maxTeams}
                                  onChange={e => {
                                    const val = Math.max(1, Number(e.target.value) || 1);
                                    updateCategory({ ...cat, maxTeams: val });
                                  }}
                                  className="w-28 bg-slate-950 border border-amber-500/50 rounded-xl px-3 py-2 text-sm text-amber-400 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
                                />

                                <div className="flex flex-wrap items-center gap-1.5">
                                  {presets.map(p => (
                                    <button
                                      key={p}
                                      type="button"
                                      onClick={() => updateCategory({ ...cat, maxTeams: p })}
                                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition font-mono cursor-pointer ${
                                        cat.maxTeams === p
                                          ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30'
                                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                                      }`}
                                    >
                                      {p}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>

                            {/* BIAYA & TOTAL HADIAH */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                              <div className="space-y-1">
                                <label className="block text-[10px] text-slate-400 uppercase font-bold">
                                  Biaya Pendaftaran (Rp)
                                </label>
                                <input
                                  type="number"
                                  value={cat.registrationFee}
                                  onChange={e => updateCategory({ ...cat, registrationFee: Number(e.target.value) || 0 })}
                                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-bold font-mono focus:outline-none focus:ring-2 focus:ring-red-500"
                                />
                              </div>

                              <div className="space-y-1">
                                <label className="block text-[10px] text-slate-400 uppercase font-bold">
                                  Total Hadiah (Rp)
                                </label>
                                <input
                                  type="number"
                                  value={cat.totalPrize}
                                  onChange={e => updateCategory({ ...cat, totalPrize: Number(e.target.value) || 0 })}
                                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-red-400 font-bold font-mono focus:outline-none focus:ring-2 focus:ring-red-500"
                                />
                              </div>
                            </div>

                            {/* SYARAT BATASAN USIA */}
                            <div className="space-y-1">
                              <label className="block text-[10px] text-slate-400 uppercase font-bold">
                                Syarat & Batasan Usia / Peserta
                              </label>
                              <input
                                type="text"
                                value={cat.ageRestriction}
                                onChange={e => updateCategory({ ...cat, ageRestriction: e.target.value })}
                                placeholder="Contoh: Kelahiran 2014 atau sesudahnya"
                                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-red-500"
                              />
                            </div>
                          </div>

                          {/* QUICK SAVE ACTION */}
                          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
                            <span className="text-[11px] text-slate-400">
                              Status: <strong className={isFull ? 'text-red-400' : 'text-emerald-400'}>{isFull ? 'Kuota Penuh (Tutup)' : 'Pendaftaran Terbuka'}</strong>
                            </span>
                            <button
                              type="button"
                              onClick={() => handleSaveCategoryQuota(cat.id)}
                              className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-semibold transition flex items-center space-x-1.5 cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Simpan {cat.id}</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* GLOBAL ACTION BUTTON */}
                  <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
                        <Sliders className="w-5 h-5" />
                      </div>
                      <div>
                        <h5 className="font-bold text-white text-sm">Sinkronisasi Kuota Kategori</h5>
                        <p className="text-xs text-slate-400">Perubahan kuota langsung berdampak real-time ke halaman utama dan sistem pendaftaran.</p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3 w-full sm:w-auto">
                      <button
                        type="button"
                        onClick={handleForceSyncQuotas}
                        className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-bold transition flex items-center justify-center space-x-2 shadow-lg cursor-pointer border border-slate-700"
                      >
                        <RefreshCw className="w-4 h-4 text-cyan-400" />
                        <span>Sinkronkan Kuota Real-Time</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleSaveAllCategoriesQuota}
                        className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition flex items-center justify-center space-x-2 shadow-lg shadow-amber-950/60 cursor-pointer"
                      >
                        <Save className="w-4 h-4" />
                        <span>Simpan Semua Pengaturan</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* SUB-TAB 6: VISIBILITAS LANDING PAGE & STANDALONE */}
              {settingsSubTab === 'VISIBILITY' && (
                <div className="space-y-6 animate-fadeIn w-full">
                  {/* TOP HEADER PANEL */}
                  <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/80 border border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
                    <div>
                      <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-300 text-[10px] font-black uppercase tracking-wider mb-2">
                        <span>CMS KONTROL VISIBILITAS TERPISAH</span>
                      </div>
                      <h4 className="text-base sm:text-lg font-black text-white flex items-center space-x-2 tracking-wide">
                        <Eye className="w-5 h-5 text-purple-400 shrink-0" />
                        <span>Pengaturan Klasemen &amp; Jadwal: Landing Page vs Standalone</span>
                      </h4>
                      <p className="text-xs text-slate-400 mt-1 max-w-3xl leading-relaxed">
                        Pisahkan kontrol tampilan modul Klasemen, Jadwal Pertandingan, Bagan Knockout, dan Top Skor. Anda dapat menyembunyikan modul di Halaman Depan (Landing Page) dan hanya memfokuskannya pada Layar Mandiri (Standalone Page / #klasemen), atau sebaliknya.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                      {visibilitySaveSuccess && (
                        <span className="px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold flex items-center space-x-1.5 animate-fadeIn">
                          <Check className="w-4 h-4" />
                          <span>Visibilitas Diperbarui!</span>
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          window.open(window.location.origin + window.location.pathname, '_blank');
                        }}
                        className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 hover:text-white border border-white/10 text-xs font-bold flex items-center space-x-1.5 transition cursor-pointer shadow-sm hover:border-white/20"
                      >
                        <span>Cek Landing Page</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          window.open(window.location.origin + window.location.pathname + '#klasemen', '_blank');
                        }}
                        className="px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold flex items-center space-x-1.5 transition cursor-pointer shadow-lg shadow-red-600/40"
                      >
                        <Trophy className="w-3.5 h-3.5 text-amber-300" />
                        <span>Buka Layar Standalone</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* PRESET QUICK TOGGLE SCHEMES */}
                  <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-900/70 border border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-md">
                    <div className="text-xs text-slate-300">
                      <span className="font-black text-white">Tombol Cepat Mode Tampilan:</span>{' '}
                      <span className="text-slate-400">Pilih skema tampilan yang diinginkan dengan 1-klik:</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleApplyVisibilityPreset('BOTH')}
                        className="px-3 py-1.5 rounded-xl bg-slate-950/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-white/10 text-xs font-bold transition cursor-pointer shadow-sm active:scale-95"
                      >
                        Tampilkan Semua di Keduanya
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApplyVisibilityPreset('STANDALONE_ONLY')}
                        className="px-3 py-1.5 rounded-xl bg-purple-950/60 hover:bg-purple-900/80 text-purple-200 border border-purple-800/40 text-xs font-bold transition cursor-pointer shadow-sm active:scale-95"
                      >
                        Fokus Layar Standalone Saja
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApplyVisibilityPreset('LANDING_ONLY')}
                        className="px-3 py-1.5 rounded-xl bg-blue-950/60 hover:bg-blue-900/80 text-blue-200 border border-blue-800/40 text-xs font-bold transition cursor-pointer shadow-sm active:scale-95"
                      >
                        Hanya Landing Page
                      </button>
                    </div>
                  </div>

                  {/* ================================================================= */}
                  {/* [1] PENGATURAN MODUL DI LANDING PAGE (HALAMAN UTAMA)              */}
                  {/* ================================================================= */}
                  <div className="space-y-4 pt-1">
                    <div className="border-b border-white/10 pb-3">
                      <div className="flex items-center space-x-2.5">
                        <span className="w-6 h-6 rounded-full bg-blue-600/20 border border-blue-500/40 text-blue-400 font-black text-xs flex items-center justify-center shrink-0">
                          1
                        </span>
                        <div>
                          <div className="flex items-center space-x-2">
                            <h5 className="text-sm font-black text-white uppercase tracking-wide">
                              PENGATURAN MODUL DI LANDING PAGE (HALAMAN UTAMA)
                            </h5>
                            <span className="px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-400 border border-blue-500/30 text-[10px] font-extrabold uppercase">
                              BERANDA
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5">
                            Pilih modul mana yang ingin ditampilkan atau disembunyikan bagi pengunjung di halaman muka turnamen.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* SUB-SECTION 1A: MODUL PERTANDINGAN DI LANDING PAGE */}
                    <div className="space-y-3">
                      <div className="text-xs font-black text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
                        <Trophy className="w-3.5 h-3.5 text-amber-400" />
                        <span>MODUL PERTANDINGAN DI BAGIAN JADWAL &amp; KLASEMEN LANDING PAGE:</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {[
                          {
                            key: 'landingKlasemen' as keyof PageSectionsVisibility,
                            title: 'Tabel Klasemen Grup',
                            desc: 'Tampilkan tabel poin, selisih gol, dan peringkat grup di section landing page.',
                            icon: Trophy,
                            color: 'text-amber-400',
                            activeTextColor: 'text-amber-400',
                            bgColor: 'bg-amber-500/10',
                            borderColor: 'border-amber-500/30',
                            toggleBg: 'bg-amber-500',
                          },
                          {
                            key: 'landingSchedule' as keyof PageSectionsVisibility,
                            title: 'Jadwal & Hasil Laga',
                            desc: 'Tampilkan agenda jadwal jam kick-off dan rekap skor pertandingan di landing page.',
                            icon: Calendar,
                            color: 'text-blue-400',
                            activeTextColor: 'text-blue-400',
                            bgColor: 'bg-blue-500/10',
                            borderColor: 'border-blue-500/30',
                            toggleBg: 'bg-blue-500',
                          },
                          {
                            key: 'landingBracket' as keyof PageSectionsVisibility,
                            title: 'Bagan Babak Knockout',
                            desc: 'Tampilkan skema bagan gugur juara grup menuju babak final di landing page.',
                            icon: Layers,
                            color: 'text-purple-400',
                            activeTextColor: 'text-purple-400',
                            bgColor: 'bg-purple-500/10',
                            borderColor: 'border-purple-500/30',
                            toggleBg: 'bg-purple-500',
                          },
                          {
                            key: 'landingTopScorer' as keyof PageSectionsVisibility,
                            title: 'Top Skor & Fairplay',
                            desc: 'Tampilkan peringkat pencetak gol terbanyak dan rekap kartu di landing page.',
                            icon: Flame,
                            color: 'text-rose-400',
                            activeTextColor: 'text-rose-400',
                            bgColor: 'bg-rose-500/10',
                            borderColor: 'border-rose-500/30',
                            toggleBg: 'bg-rose-500',
                          },
                        ].map(mod => {
                          const isVis = (config.sectionsVisibility?.[mod.key] ?? true) !== false;
                          const IconComp = mod.icon;

                          return (
                            <div
                              key={mod.key}
                              className={`p-4 rounded-2xl bg-slate-900/90 border transition-all duration-200 flex flex-col justify-between space-y-3 ${
                                isVis ? 'border-slate-700/90 shadow-md shadow-black/40' : 'border-slate-800/40 opacity-70'
                              }`}
                            >
                              <div className="space-y-2.5">
                                <div className="flex items-center justify-between">
                                  <div className={`w-9 h-9 rounded-xl ${mod.bgColor} ${mod.color} flex items-center justify-center font-bold border ${mod.borderColor}`}>
                                    <IconComp className="w-4 h-4" />
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => handleToggleSectionVisibility(mod.key)}
                                    className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                      isVis ? mod.toggleBg : 'bg-slate-700'
                                    }`}
                                    role="switch"
                                    aria-checked={isVis}
                                  >
                                    <span
                                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                                        isVis ? 'translate-x-5' : 'translate-x-0'
                                      }`}
                                    />
                                  </button>
                                </div>

                                <div>
                                  <h6 className="font-bold text-xs sm:text-sm text-white">{mod.title}</h6>
                                  <p className="text-[11px] text-slate-400 mt-1 leading-snug">{mod.desc}</p>
                                </div>
                              </div>

                              <div className="pt-2.5 border-t border-slate-800/80 flex items-center justify-between">
                                <span className={`text-[11px] font-bold ${isVis ? mod.activeTextColor : 'text-slate-500'}`}>
                                  {isVis ? 'Tampil di Landing' : 'Disembunyikan'}
                                </span>

                                <button
                                  type="button"
                                  onClick={() => handleToggleSectionVisibility(mod.key)}
                                  className="text-[10px] font-semibold text-slate-400 hover:text-white underline cursor-pointer"
                                >
                                  {isVis ? 'Sembunyikan' : 'Aktifkan'}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* SUB-SECTION 1B: SECTION PENDUKUNG LAINNYA DI LANDING PAGE */}
                    <div className="space-y-3 pt-2">
                      <div className="text-xs font-black text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
                        <Zap className="w-3.5 h-3.5 text-emerald-400" />
                        <span>SECTION PENDUKUNG LAINNYA DI LANDING PAGE:</span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {[
                          {
                            key: 'hero' as keyof PageSectionsVisibility,
                            title: 'Hero Banner & Registrasi',
                            desc: 'Header visual utama turnamen, tagline, hitung mundur, dan tombol CTA pendaftaran.',
                            icon: Sparkles,
                            color: 'text-rose-400',
                            bgColor: 'bg-rose-500/10',
                            borderColor: 'border-rose-500/30',
                          },
                          {
                            key: 'liveScore' as keyof PageSectionsVisibility,
                            title: 'Live Score & Quick Match',
                            desc: 'Widget ringkasan skor pertandingan langsung (LIVE) dan jadwal hari ini di atas beranda.',
                            icon: Activity,
                            color: 'text-amber-400',
                            bgColor: 'bg-amber-500/10',
                            borderColor: 'border-amber-500/30',
                          },
                          {
                            key: 'categories' as keyof PageSectionsVisibility,
                            title: 'Kategori & Total Hadiah',
                            desc: 'Daftar kategori usia, rincian hadiah juara, biaya registrasi, dan syarat batasan usia.',
                            icon: Award,
                            color: 'text-emerald-400',
                            bgColor: 'bg-emerald-500/10',
                            borderColor: 'border-emerald-500/30',
                          },
                          {
                            key: 'bracket' as keyof PageSectionsVisibility,
                            title: 'Section Induk Jadwal & Bagan',
                            desc: 'Sakelar global seluruh section jadwal, klasemen, dan direktori tim di landing page.',
                            icon: Shuffle,
                            color: 'text-blue-400',
                            bgColor: 'bg-blue-500/10',
                            borderColor: 'border-blue-500/30',
                          },
                          {
                            key: 'venue' as keyof PageSectionsVisibility,
                            title: 'Lokasi Stadion & Maps Venue',
                            desc: 'Informasi stadion pertandingan, alamat lengkap, dan peta lokasi Google Maps.',
                            icon: MapPin,
                            color: 'text-cyan-400',
                            bgColor: 'bg-cyan-500/10',
                            borderColor: 'border-cyan-500/30',
                          },
                          {
                            key: 'sponsors' as keyof PageSectionsVisibility,
                            title: 'Mitra Sponsor & Kerjasama',
                            desc: 'Grid logo sponsor resmi turnamen beserta tombol kontak kerjasama sponsor.',
                            icon: Building,
                            color: 'text-purple-400',
                            bgColor: 'bg-purple-500/10',
                            borderColor: 'border-purple-500/30',
                          },
                          {
                            key: 'registrationButton' as keyof PageSectionsVisibility,
                            title: 'Tombol Pendaftaran Tim (Daftar Sekarang)',
                            desc: 'Sembunyikan atau tampilkan seluruh tombol "Daftar Tim" di Navbar, Hero, Kategori, dan Bagan saat kuota penuh atau pendaftaran belum dibuka.',
                            icon: UserPlus,
                            color: 'text-rose-400',
                            bgColor: 'bg-rose-500/10',
                            borderColor: 'border-rose-500/30',
                          },
                        ].map(sec => {
                          const isVis = (config.sectionsVisibility?.[sec.key] ?? true) !== false;
                          const IconComp = sec.icon;

                          return (
                            <div
                              key={sec.key}
                              className={`p-4 rounded-2xl bg-slate-900/90 border transition-all duration-200 flex flex-col justify-between space-y-3 ${
                                isVis ? 'border-slate-700/80 shadow-md shadow-black/40' : 'border-slate-800/40 opacity-70'
                              }`}
                            >
                              <div className="space-y-2.5">
                                <div className="flex items-center justify-between">
                                  <div className={`w-9 h-9 rounded-xl ${sec.bgColor} ${sec.color} flex items-center justify-center font-bold border ${sec.borderColor}`}>
                                    <IconComp className="w-4 h-4" />
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => handleToggleSectionVisibility(sec.key)}
                                    className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                      isVis ? 'bg-emerald-500' : 'bg-slate-700'
                                    }`}
                                    role="switch"
                                    aria-checked={isVis}
                                  >
                                    <span
                                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                                        isVis ? 'translate-x-5' : 'translate-x-0'
                                      }`}
                                    />
                                  </button>
                                </div>

                                <div>
                                  <h6 className="font-bold text-xs sm:text-sm text-white">{sec.title}</h6>
                                  <p className="text-[11px] text-slate-400 mt-1 leading-snug">{sec.desc}</p>
                                </div>
                              </div>

                              <div className="pt-2.5 border-t border-slate-800/80 flex items-center justify-between">
                                <span className={`text-[11px] font-bold ${
                                  sec.key === 'registrationButton'
                                    ? regButtonMode === 'INTERNAL_FORM' ? 'text-emerald-400' : regButtonMode === 'CUSTOM_LINK' ? 'text-cyan-400' : 'text-slate-500'
                                    : isVis ? 'text-emerald-400' : 'text-slate-500'
                                }`}>
                                  {sec.key === 'registrationButton'
                                    ? regButtonMode === 'INTERNAL_FORM' ? 'Form Asli Sistem' : regButtonMode === 'CUSTOM_LINK' ? 'Tombol Samaran (Link)' : 'Disembunyikan'
                                    : isVis ? 'Aktif di Landing' : 'Disembunyikan'}
                                </span>

                                <button
                                  type="button"
                                  onClick={() => handleToggleSectionVisibility(sec.key)}
                                  className="text-[10px] font-semibold text-slate-400 hover:text-white underline cursor-pointer"
                                >
                                  {isVis ? 'Sembunyikan' : 'Aktifkan'}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* SUB-SECTION 1C: PENGATURAN MODE TOMBOL PENDAFTARAN & TOMBOL SAMARAN (LINK KUSTOM) */}
                    <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 border border-cyan-500/30 shadow-xl space-y-5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
                        <div className="flex items-start space-x-3">
                          <div className="w-10 h-10 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 flex items-center justify-center shrink-0">
                            <Globe className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center space-x-2">
                              <h4 className="text-sm font-bold text-white uppercase">
                                Pengaturan Tombol Pendaftaran & Tombol Samaran (Link Kustom)
                              </h4>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                                regButtonMode === 'INTERNAL_FORM'
                                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                  : regButtonMode === 'CUSTOM_LINK'
                                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                                  : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                              }`}>
                                {regButtonMode === 'INTERNAL_FORM' ? 'FORM ASLI' : regButtonMode === 'CUSTOM_LINK' ? 'TOMBOL SAMARAN' : 'DISEMBUNYIKAN'}
                              </span>
                            </div>
                            <p className="text-xs text-slate-400 mt-0.5">
                              Pilih mode kerja tombol pendaftaran di seluruh frontend, atau buat tombol samaran yang mengarahkan pendaftar ke Google Form / tautan panitia.
                            </p>
                          </div>
                        </div>

                        {regButtonSaveSuccess && (
                          <span className="px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold flex items-center space-x-1.5 animate-fadeIn shrink-0 shadow-lg shadow-emerald-950/40">
                            <Check className="w-3.5 h-3.5" />
                            <span>Pengaturan Disimpan!</span>
                          </span>
                        )}
                      </div>

                      {/* 3 MODE CARDS */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                        {/* MODE 1: INTERNAL FORM */}
                        <div
                          onClick={() => setRegButtonMode('INTERNAL_FORM')}
                          className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between space-y-3 ${
                            regButtonMode === 'INTERNAL_FORM'
                              ? 'bg-emerald-950/40 border-emerald-500/60 shadow-lg shadow-emerald-950/50'
                              : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex items-center space-x-2.5">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                                regButtonMode === 'INTERNAL_FORM' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'
                              }`}>
                                <FileText className="w-4 h-4" />
                              </div>
                              <div>
                                <h5 className="text-xs font-bold text-white">Formulir Asli Sistem</h5>
                                <span className="text-[10px] text-emerald-400 font-semibold">Mode Bawaan</span>
                              </div>
                            </div>
                            <input
                              type="radio"
                              name="regModeVisibility"
                              checked={regButtonMode === 'INTERNAL_FORM'}
                              onChange={() => setRegButtonMode('INTERNAL_FORM')}
                              className="text-emerald-500 focus:ring-emerald-500 mt-1 cursor-pointer"
                            />
                          </div>
                          <p className="text-[11px] text-slate-400 leading-snug">
                            Tombol membuka formulir pendaftaran modal bawaan turnamen (dengan upload dokumen, logo tim, dan validasi kuota otomatis).
                          </p>
                        </div>

                        {/* MODE 2: CUSTOM LINK (TOMBOL SAMARAN) */}
                        <div
                          onClick={() => setRegButtonMode('CUSTOM_LINK')}
                          className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between space-y-3 ${
                            regButtonMode === 'CUSTOM_LINK'
                              ? 'bg-cyan-950/40 border-cyan-500/60 shadow-lg shadow-cyan-950/50'
                              : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex items-center space-x-2.5">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                                regButtonMode === 'CUSTOM_LINK' ? 'bg-cyan-500/20 text-cyan-400' : 'bg-slate-800 text-slate-400'
                              }`}>
                                <Globe className="w-4 h-4" />
                              </div>
                              <div>
                                <h5 className="text-xs font-bold text-white">Tombol Samaran</h5>
                                <span className="text-[10px] text-cyan-400 font-semibold">Tautan Kustom Eksternal</span>
                              </div>
                            </div>
                            <input
                              type="radio"
                              name="regModeVisibility"
                              checked={regButtonMode === 'CUSTOM_LINK'}
                              onChange={() => setRegButtonMode('CUSTOM_LINK')}
                              className="text-cyan-500 focus:ring-cyan-500 mt-1 cursor-pointer"
                            />
                          </div>
                          <p className="text-[11px] text-slate-400 leading-snug">
                            Tombol pendaftaran tetap muncul di frontend, namun saat diklik akan mengarahkan ke link kustom (Google Form, WA panitia, Waiting List).
                          </p>
                        </div>

                        {/* MODE 3: HIDDEN */}
                        <div
                          onClick={() => setRegButtonMode('HIDDEN')}
                          className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between space-y-3 ${
                            regButtonMode === 'HIDDEN'
                              ? 'bg-rose-950/40 border-rose-500/60 shadow-lg shadow-rose-950/50'
                              : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex items-center space-x-2.5">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                                regButtonMode === 'HIDDEN' ? 'bg-rose-500/20 text-rose-400' : 'bg-slate-800 text-slate-400'
                              }`}>
                                <Lock className="w-4 h-4" />
                              </div>
                              <div>
                                <h5 className="text-xs font-bold text-white">Sembunyikan Total</h5>
                                <span className="text-[10px] text-rose-400 font-semibold">Tutup Akses Publik</span>
                              </div>
                            </div>
                            <input
                              type="radio"
                              name="regModeVisibility"
                              checked={regButtonMode === 'HIDDEN'}
                              onChange={() => setRegButtonMode('HIDDEN')}
                              className="text-rose-500 focus:ring-rose-500 mt-1 cursor-pointer"
                            />
                          </div>
                          <p className="text-[11px] text-slate-400 leading-snug">
                            Seluruh tombol pendaftaran tim disembunyikan di Navbar, Hero, Kategori, dan Bagan. Cocok saat pendaftaran benar-benar ditutup.
                          </p>
                        </div>
                      </div>

                      {/* FORM INPUTS FOR CUSTOM LINK (TOMBOL SAMARAN) */}
                      <div className={`p-4 rounded-xl border transition-all space-y-4 ${
                        regButtonMode === 'CUSTOM_LINK'
                          ? 'bg-slate-950/90 border-cyan-500/30'
                          : 'bg-slate-950/40 border-slate-800/60 opacity-80'
                      }`}>
                        <div className="flex items-center justify-between">
                          <h5 className="text-xs font-bold text-cyan-300 uppercase flex items-center space-x-1.5">
                            <LinkIcon className="w-3.5 h-3.5" />
                            <span>Konfigurasi Tautan & Label Tombol Samaran:</span>
                          </h5>
                          {regButtonMode !== 'CUSTOM_LINK' && (
                            <span className="text-[10px] text-slate-500 italic">
                              (Hanya aktif saat memilih mode "Tombol Samaran")
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-300 flex items-center space-x-1">
                              <span>URL Tautan Kustom:</span>
                              <span className="text-rose-400">*</span>
                            </label>
                            <input
                              type="url"
                              value={regCustomLink}
                              onChange={e => setRegCustomLink(e.target.value)}
                              placeholder="https://forms.gle/... atau https://wa.me/628123456789..."
                              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 font-mono"
                            />
                            <p className="text-[10px] text-slate-400">
                              Mendukung URL web (https://), Google Forms, link WhatsApp (wa.me), atau dokumen formulir pendaftaran luar.
                            </p>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-300 flex items-center space-x-1">
                              <span>Teks Label Tombol Kustom (Opsional):</span>
                            </label>
                            <input
                              type="text"
                              value={regCustomBtnText}
                              onChange={e => setRegCustomBtnText(e.target.value)}
                              placeholder="Contoh: Daftar via Google Form, Waiting List Tim, dsb."
                              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                            />
                            <p className="text-[10px] text-slate-400">
                              Biarkan kosong jika ingin menggunakan label bawaan tombol ("Daftar Tim", "Daftarkan Tim Sekarang").
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-800">
                          <label className="flex items-center space-x-2 cursor-pointer text-xs text-slate-300 select-none">
                            <input
                              type="checkbox"
                              checked={regCustomNewTab}
                              onChange={e => setRegCustomNewTab(e.target.checked)}
                              className="w-4 h-4 rounded border-slate-700 text-cyan-500 focus:ring-cyan-500 cursor-pointer"
                            />
                            <span>Buka tautan kustom di tab browser baru (<code>target="_blank"</code>)</span>
                          </label>

                          <div className="flex items-center space-x-2">
                            {regCustomLink && (
                              <a
                                href={formatExternalLink(regCustomLink)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer"
                                title="Uji coba membuka tautan di tab baru"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                                <span>Uji Link</span>
                              </a>
                            )}

                            <button
                              type="button"
                              onClick={() => handleSaveRegistrationButtonSettings(regButtonMode, regCustomLink, regCustomBtnText, regCustomNewTab)}
                              className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition flex items-center space-x-1.5 shadow-lg shadow-cyan-950/50 cursor-pointer"
                            >
                              <Save className="w-4 h-4" />
                              <span>Simpan Pengaturan Pendaftaran</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ================================================================= */}
                  {/* [2] PENGATURAN HALAMAN STANDALONE (LAYAR MANDIRI / #KLASEMEN)     */}
                  {/* ================================================================= */}
                  <div className="space-y-4 pt-2">
                    <div className="border-b border-white/10 pb-3">
                      <div className="flex items-center space-x-2.5">
                        <span className="w-6 h-6 rounded-full bg-red-600/20 border border-red-500/40 text-red-400 font-black text-xs flex items-center justify-center shrink-0">
                          2
                        </span>
                        <div>
                          <div className="flex items-center space-x-2">
                            <h5 className="text-sm font-black text-white uppercase tracking-wide">
                              PENGATURAN HALAMAN STANDALONE (LAYAR MANDIRI / #KLASEMEN)
                            </h5>
                            <span className="px-2 py-0.5 rounded-md bg-red-500/20 text-red-400 border border-red-500/30 text-[10px] font-extrabold uppercase">
                              STANDALONE PAGE
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5">
                            Atur menu, tab, dan hak akses layar mandiri khusus Klasemen &amp; Jadwal (cocok untuk monitor TV venue pertandingan).
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* SAKELAR MASTER AKSES HALAMAN STANDALONE */}
                    {(() => {
                      const isStandaloneActive = (config.sectionsVisibility?.standaloneKlasemen ?? true) !== false;
                      return (
                        <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-red-950/40 via-slate-900 to-slate-900/90 border border-red-900/40 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="flex items-start sm:items-center space-x-3.5">
                            <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 flex items-center justify-center shrink-0">
                              <Globe className="w-5 h-5" />
                            </div>
                            <div>
                              <div className="flex items-center space-x-2 flex-wrap">
                                <h6 className="font-black text-sm text-white">
                                  Sakelar Master Akses Halaman Publik Standalone
                                </h6>
                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
                                  isStandaloneActive
                                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                    : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                }`}>
                                  {isStandaloneActive ? 'AKSES TERBUKA' : 'DITUTUP'}
                                </span>
                              </div>
                              <p className="text-xs text-slate-400 mt-1 max-w-3xl leading-relaxed">
                                Jika diaktifkan, pengunjung dapat membuka URL langsung <span className="text-red-400 font-semibold font-mono">#klasemen</span>. Jika ditutup, pengunjung akan diarahkan kembali ke beranda dengan pesan info panitia.
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center space-x-3 shrink-0 self-end sm:self-center">
                            <button
                              type="button"
                              onClick={() => handleToggleSectionVisibility('standaloneKlasemen')}
                              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                isStandaloneActive ? 'bg-red-600' : 'bg-slate-700'
                              }`}
                              role="switch"
                              aria-checked={isStandaloneActive}
                            >
                              <span
                                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                                  isStandaloneActive ? 'translate-x-5' : 'translate-x-0'
                                }`}
                              />
                            </button>
                          </div>
                        </div>
                      );
                    })()}

                    {/* SUB-SECTION 2A: VISIBILITAS TAB NAVIGASI STANDALONE */}
                    <div className="space-y-3 pt-1">
                      <div className="text-xs font-black text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
                        <Sliders className="w-3.5 h-3.5 text-purple-400" />
                        <span>VISIBILITAS TAB NAVIGASI DI HALAMAN STANDALONE:</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {[
                          {
                            key: 'standaloneTabKlasemen' as keyof PageSectionsVisibility,
                            title: 'Tab Klasemen (Standalone)',
                            desc: 'Aktifkan tab tabel klasemen per grup & per kategori di layar standalone.',
                            icon: Trophy,
                            color: 'text-amber-400',
                            activeTextColor: 'text-amber-400',
                            bgColor: 'bg-amber-500/10',
                            borderColor: 'border-amber-500/30',
                            toggleBg: 'bg-amber-500',
                          },
                          {
                            key: 'standaloneTabJadwal' as keyof PageSectionsVisibility,
                            title: 'Tab Jadwal & Hasil (Standalone)',
                            desc: 'Aktifkan tab jadwal laga dan rekap hasil pertandingan di layar standalone.',
                            icon: Calendar,
                            color: 'text-blue-400',
                            activeTextColor: 'text-blue-400',
                            bgColor: 'bg-blue-500/10',
                            borderColor: 'border-blue-500/30',
                            toggleBg: 'bg-blue-500',
                          },
                          {
                            key: 'standaloneTabKnockout' as keyof PageSectionsVisibility,
                            title: 'Tab Bagan Knockout (Standalone)',
                            desc: 'Aktifkan tab visual pohon bagan gugur per kategori di layar standalone.',
                            icon: Layers,
                            color: 'text-purple-400',
                            activeTextColor: 'text-purple-400',
                            bgColor: 'bg-purple-500/10',
                            borderColor: 'border-purple-500/30',
                            toggleBg: 'bg-purple-500',
                          },
                          {
                            key: 'standaloneTabTopScore' as keyof PageSectionsVisibility,
                            title: 'Tab Top Skor & Kartu (Standalone)',
                            desc: 'Aktifkan tab papan top scorer dan rekap kartu pelanggaran di layar standalone.',
                            icon: Flame,
                            color: 'text-rose-400',
                            activeTextColor: 'text-rose-400',
                            bgColor: 'bg-rose-500/10',
                            borderColor: 'border-rose-500/30',
                            toggleBg: 'bg-rose-500',
                          },
                        ].map(tab => {
                          const isVis = (config.sectionsVisibility?.[tab.key] ?? true) !== false;
                          const IconComp = tab.icon;

                          return (
                            <div
                              key={tab.key}
                              className={`p-4 rounded-2xl bg-slate-900/90 border transition-all duration-200 flex flex-col justify-between space-y-3 ${
                                isVis ? 'border-slate-700/90 shadow-md shadow-black/40' : 'border-slate-800/40 opacity-70'
                              }`}
                            >
                              <div className="space-y-2.5">
                                <div className="flex items-center justify-between">
                                  <div className={`w-9 h-9 rounded-xl ${tab.bgColor} ${tab.color} flex items-center justify-center font-bold border ${tab.borderColor}`}>
                                    <IconComp className="w-4 h-4" />
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => handleToggleSectionVisibility(tab.key)}
                                    className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                      isVis ? tab.toggleBg : 'bg-slate-700'
                                    }`}
                                    role="switch"
                                    aria-checked={isVis}
                                  >
                                    <span
                                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                                        isVis ? 'translate-x-5' : 'translate-x-0'
                                      }`}
                                    />
                                  </button>
                                </div>

                                <div>
                                  <h6 className="font-bold text-xs sm:text-sm text-white">{tab.title}</h6>
                                  <p className="text-[11px] text-slate-400 mt-1 leading-snug">{tab.desc}</p>
                                </div>
                              </div>

                              <div className="pt-2.5 border-t border-slate-800/80 flex items-center justify-between">
                                <span className={`text-[11px] font-bold ${isVis ? tab.activeTextColor : 'text-slate-500'}`}>
                                  {isVis ? 'Tampil di Standalone' : 'Disembunyikan'}
                                </span>

                                <button
                                  type="button"
                                  onClick={() => handleToggleSectionVisibility(tab.key)}
                                  className="text-[10px] font-semibold text-slate-400 hover:text-white underline cursor-pointer"
                                >
                                  {isVis ? 'Sembunyikan' : 'Aktifkan'}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* BOTTOM REAL-TIME SYNCHRONIZATION BANNER */}
                  <div className="p-4 rounded-2xl bg-purple-950/25 border border-purple-800/30 flex items-start space-x-3 text-xs text-purple-200 shadow-md">
                    <CheckSquare className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="block text-white font-bold mb-0.5">Sinkronisasi Real-Time Dua Layar</strong>
                      Pengaturan visibilitas langsung tersimpan secara permanen ke database turnamen. Pengunjung yang sedang membuka Landing Page atau Layar Standalone akan melihat perubahan seketika tanpa memerlukan restart server.
                    </div>
                  </div>
                </div>
              )}

              {/* SUB-TAB 7: BACKGROUND & HERO IMAGE TIAP SECTION */}
              {settingsSubTab === 'BACKGROUNDS' && (
                <div className="animate-fadeIn">
                  <SectionBackgroundManager />
                </div>
              )}

              {/* SUB-TAB 8: TANDA TANGAN KETUA PANITIA & CAP WABUP CUP 2026 */}
              {settingsSubTab === 'SIGNATURE_STAMP' && (
                <div className="space-y-6 animate-fadeIn">
                  {/* HEADER BANNER */}
                  <div className="p-4 rounded-2xl bg-gradient-to-r from-red-950/60 via-slate-900 to-slate-900 border border-red-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h4 className="text-sm font-bold text-white uppercase flex items-center space-x-2">
                        <FileText className="w-4 h-4 text-red-500" />
                        <span>Pengesahan Dokumen: Tanda Tangan Ketua Panitia & Cap Wabup Cup 2026</span>
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Konfigurasi nama pejabat pengesah, tanda tangan resmi, dan stempel basah turnamen yang tertera otomatis pada dokumen Invoice & Kuitansi PDF.
                      </p>
                    </div>

                    <div className="flex items-center space-x-2 shrink-0">
                      {signatureSaveSuccess && (
                        <span className="px-3 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold flex items-center space-x-1 animate-fadeIn">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Tersimpan!</span>
                        </span>
                      )}
                      {registrations.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            const paidOrFirst = registrations.find(r => r.paymentStatus === 'PAID') || registrations[0];
                            handleOpenInvoice(paidOrFirst);
                          }}
                          className="px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold flex items-center space-x-1.5 transition cursor-pointer shadow-md shadow-red-950/50"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>Uji Coba Invoice PDF</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* FORM INPUTS */}
                    <div className="lg:col-span-7 space-y-5 bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
                      <div>
                        <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                          Nama Lengkap Ketua Panitia
                        </label>
                        <input
                          type="text"
                          value={config.committeeChairmanName || ''}
                          placeholder="AHMAT IQBAL FIRDAUS"
                          onChange={e => updateConfig({ committeeChairmanName: e.target.value })}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-red-500 transition font-medium"
                        />
                        <p className="text-[11px] text-slate-500 mt-1">
                          Nama terang yang akan tercantum dengan garis bawah tebal pada lembar pengesahan invoice.
                        </p>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                          Jabatan Resmi Pejabat
                        </label>
                        <input
                          type="text"
                          value={config.committeeChairmanTitle || ''}
                          placeholder="Ketua Panitia Pelaksana Wabup Cup 2026"
                          onChange={e => updateConfig({ committeeChairmanTitle: e.target.value })}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-red-500 transition font-medium"
                        />
                        <p className="text-[11px] text-slate-500 mt-1">
                          Keterangan titel atau jabatan di bawah nama terang (misal: Ketua Panitia Pelaksana).
                        </p>
                      </div>

                      {/* UPLOAD CUSTOM TTD */}
                      <div className="pt-2 border-t border-slate-800/80">
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                            Berkas Tanda Tangan Ketua Panitia
                          </label>
                          {config.committeeChairmanSignature && (
                            <button
                              type="button"
                              onClick={() => {
                                updateConfig({ committeeChairmanSignature: '' });
                                setSignatureSaveSuccess(true);
                                setTimeout(() => setSignatureSaveSuccess(false), 2500);
                              }}
                              className="text-[10px] text-red-400 hover:text-red-300 font-bold underline cursor-pointer"
                            >
                              Reset ke TTD Resmi Default
                            </button>
                          )}
                        </div>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          onChange={e => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onload = () => {
                                updateConfig({ committeeChairmanSignature: reader.result as string });
                                setSignatureSaveSuccess(true);
                                setTimeout(() => setSignatureSaveSuccess(false), 2500);
                              };
                              reader.readAsDataURL(file);
                            }
                          }}
                          className="w-full text-xs text-slate-400 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-slate-800 file:text-slate-200 hover:file:bg-slate-700 cursor-pointer"
                        />
                        <p className="text-[11px] text-slate-500 mt-1">
                          Format PNG transparan resolusi tinggi (tinta hitam/biru gelap) direkomendasikan. Jika dikosongkan, sistem secara otomatis menggunakan TTD Ketua Panitia resmi yang telah disediakan.
                        </p>
                      </div>

                      {/* UPLOAD CUSTOM CAP */}
                      <div className="pt-2 border-t border-slate-800/80">
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                            Berkas Cap / Stempel Turnamen (Red Seal)
                          </label>
                          {config.tournamentStampImage && (
                            <button
                              type="button"
                              onClick={() => {
                                updateConfig({ tournamentStampImage: '' });
                                setSignatureSaveSuccess(true);
                                setTimeout(() => setSignatureSaveSuccess(false), 2500);
                              }}
                              className="text-[10px] text-red-400 hover:text-red-300 font-bold underline cursor-pointer"
                            >
                              Reset ke Cap Resmi Default
                            </button>
                          )}
                        </div>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          onChange={e => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onload = () => {
                                updateConfig({ tournamentStampImage: reader.result as string });
                                setSignatureSaveSuccess(true);
                                setTimeout(() => setSignatureSaveSuccess(false), 2500);
                              };
                              reader.readAsDataURL(file);
                            }
                          }}
                          className="w-full text-xs text-slate-400 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-slate-800 file:text-slate-200 hover:file:bg-slate-700 cursor-pointer"
                        />
                        <p className="text-[11px] text-slate-500 mt-1">
                          Format PNG bulat transparan stempel merah. Jika dikosongkan, stempel basah resmi "Cap Panitia Pelaksana Wabup Cup 2026 - LUNAS" otomatis digunakan.
                        </p>
                      </div>
                    </div>

                    {/* LIVE VISUAL PREVIEW CARD */}
                    <div className="lg:col-span-5 bg-white text-slate-900 rounded-2xl p-6 shadow-xl border border-slate-200 flex flex-col justify-between">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            Pratinjau Pengesahan Invoice
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase">
                            Sah & Terverifikasi
                          </span>
                        </div>

                        <div className="text-center space-y-1">
                          <p className="text-xs text-slate-600">
                            {config.venueCity || 'Banyuwangi'}, 24 Oktober 2026
                          </p>
                          <p className="text-xs font-bold text-slate-900">
                            Panitia Pelaksana Turnamen Futsal {config.name || 'Wabup Cup'} {config.edition || '2026'}
                          </p>
                          <p className="text-[11px] text-slate-600">
                            {config.committeeChairmanTitle || 'Ketua Panitia Pelaksana'},
                          </p>

                          {/* OVERLAPPING STAMP & SIGNATURE PREVIEW */}
                          <div className="relative h-28 w-full flex items-center justify-center my-1 select-none">
                            {/* OFFICIAL CAP */}
                            <div className="absolute left-6 top-1 w-24 h-24 pointer-events-none opacity-90 z-20">
                              {config.tournamentStampImage ? (
                                <img loading="lazy"
                                  src={config.tournamentStampImage}
                                  alt="Cap Turnamen"
                                  className="w-full h-full object-contain -rotate-6"
                                />
                              ) : (
                                <div
                                  className="w-full h-full"
                                  dangerouslySetInnerHTML={{ __html: DEFAULT_STAMP_SVG }}
                                />
                              )}
                            </div>

                            {/* TANDA TANGAN */}
                            <div className="relative w-44 h-24 flex items-center justify-center z-10">
                              {config.committeeChairmanSignature ? (
                                <img loading="lazy"
                                  src={config.committeeChairmanSignature}
                                  alt="Tanda Tangan"
                                  className="w-full h-full object-contain"
                                />
                              ) : (
                                <div
                                  className="w-full h-full"
                                  dangerouslySetInnerHTML={{ __html: DEFAULT_SIGNATURE_SVG }}
                                />
                              )}
                            </div>
                          </div>

                          <p className="text-xs font-bold text-slate-900 underline decoration-slate-900 decoration-1 underline-offset-2">
                            {config.committeeChairmanName || 'AHMAT IQBAL FIRDAUS'}
                          </p>
                          <p className="text-[10px] text-slate-500 font-medium">
                            {config.committeeChairmanTitle || 'Ketua Panitia Pelaksana'}
                          </p>
                        </div>
                      </div>

                      <div className="pt-4 border-t border-slate-100 text-[10px] text-slate-400 text-center">
                        Tampilan tanda tangan & cap stempel di atas akan tercetak tepat di sudut kanan bawah setiap Invoice PDF resmi.
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* SUB-TAB 9: INFORMASI UMUM TURNAMEN */}
              {settingsSubTab === 'GENERAL' && (
                <div className="space-y-6 animate-fadeIn">
                  <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-white uppercase flex items-center space-x-2">
                        <Building className="w-4 h-4 text-red-500" />
                        <span>Informasi & Konfigurasi Utama Turnamen</span>
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Ubah metadata turnamen, batas pendaftaran, lokasi stadion, embed maps, dan total hadiah.
                      </p>
                    </div>

                    {generalSaveSuccess && (
                      <span className="px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold flex items-center space-x-1.5 animate-fadeIn">
                        <Check className="w-4 h-4" />
                        <span>Pengaturan Tersimpan!</span>
                      </span>
                    )}
                  </div>

                  <form onSubmit={handleSaveGeneralConfig} className="p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                      {/* NAMA TURNAMEN */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                          Nama Turnamen
                        </label>
                        <input
                          type="text"
                          required
                          value={generalConfigForm.name}
                          onChange={e => setGeneralConfigForm({ ...generalConfigForm, name: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                        />
                      </div>

                      {/* EDISI */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                          Edisi / Tahun
                        </label>
                        <input
                          type="text"
                          required
                          value={generalConfigForm.edition}
                          onChange={e => setGeneralConfigForm({ ...generalConfigForm, edition: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                        />
                      </div>

                      {/* TOTAL POOL HADIAH */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                          Total Hadiah Pool (Rp)
                        </label>
                        <input
                          type="number"
                          required
                          value={generalConfigForm.totalPrizePool}
                          onChange={e => setGeneralConfigForm({ ...generalConfigForm, totalPrizePool: Number(e.target.value) || 0 })}
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                        />
                      </div>

                      {/* TAGLINE */}
                      <div className="space-y-1.5 md:col-span-2 lg:col-span-3">
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                          Slogan / Tagline
                        </label>
                        <input
                          type="text"
                          value={generalConfigForm.tagline}
                          onChange={e => setGeneralConfigForm({ ...generalConfigForm, tagline: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                        />
                      </div>

                      {/* BATAS PENDAFTARAN */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                          Batas Akhir Pendaftaran
                        </label>
                        <input
                          type="text"
                          value={generalConfigForm.registrationDeadline}
                          onChange={e => setGeneralConfigForm({ ...generalConfigForm, registrationDeadline: e.target.value })}
                          placeholder="2026-06-15"
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                        />
                      </div>

                      {/* TANGGAL MULAI */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                          Tanggal Mulai Turnamen
                        </label>
                        <input
                          type="text"
                          value={generalConfigForm.tournamentStartDate}
                          onChange={e => setGeneralConfigForm({ ...generalConfigForm, tournamentStartDate: e.target.value })}
                          placeholder="2026-06-20"
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                        />
                      </div>

                      {/* TANGGAL SELESAI */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                          Tanggal Selesai Turnamen
                        </label>
                        <input
                          type="text"
                          value={generalConfigForm.tournamentEndDate}
                          onChange={e => setGeneralConfigForm({ ...generalConfigForm, tournamentEndDate: e.target.value })}
                          placeholder="2026-06-28"
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                        />
                      </div>

                      {/* NAMA VENUE */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                          Nama Stadion / GOR
                        </label>
                        <input
                          type="text"
                          value={generalConfigForm.venueName}
                          onChange={e => setGeneralConfigForm({ ...generalConfigForm, venueName: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                        />
                      </div>

                      {/* ALAMAT VENUE */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                          Alamat Lengkap Venue
                        </label>
                        <input
                          type="text"
                          value={generalConfigForm.venueAddress}
                          onChange={e => setGeneralConfigForm({ ...generalConfigForm, venueAddress: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                        />
                      </div>

                      {/* KOTA VENUE */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                          Kota / Kabupaten
                        </label>
                        <input
                          type="text"
                          value={generalConfigForm.venueCity}
                          onChange={e => setGeneralConfigForm({ ...generalConfigForm, venueCity: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                        />
                      </div>

                      {/* GOOGLE MAPS EMBED URL */}
                      <div className="space-y-1.5 md:col-span-2 lg:col-span-3">
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                          Google Maps Embed URL
                        </label>
                        <input
                          type="url"
                          value={generalConfigForm.googleMapsEmbedUrl}
                          onChange={e => setGeneralConfigForm({ ...generalConfigForm, googleMapsEmbedUrl: e.target.value })}
                          placeholder="https://www.google.com/maps/embed?..."
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                        />
                      </div>
                    </div>

                    {/* LOGO & BRANDING RESMI TURNAMEN */}
                    <div className="pt-6 border-t border-slate-800 space-y-4">
                      <div>
                        <h5 className="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-2">
                          <ImageIcon className="w-4 h-4 text-amber-400" />
                          <span>Logo Turnamen & Logo Panitia Penyelenggara</span>
                        </h5>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Logo ini akan otomatis tampil di Navbar header, Hero banner beranda, footer, dan dokumen resmi.
                        </p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* 1. LOGO WABUP CUP */}
                        <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-4">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-200 uppercase">
                              1. Logo Utama WabupCup
                            </span>
                            {generalConfigForm.wabupLogoUrl && (
                              <button
                                type="button"
                                onClick={handleRemoveWabupLogo}
                                className="text-[11px] font-semibold text-rose-400 hover:text-rose-300 hover:underline flex items-center space-x-1 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Hapus Logo</span>
                              </button>
                            )}
                          </div>

                          {/* Preview Frame */}
                          <div className="w-full h-32 rounded-xl bg-slate-900 border border-dashed border-slate-700 flex items-center justify-center p-3 overflow-hidden relative group">
                            {generalConfigForm.wabupLogoUrl ? (
                              <img loading="lazy"
                                src={generalConfigForm.wabupLogoUrl}
                                alt="Preview Logo WabupCup"
                                className="max-h-full max-w-full object-contain filter drop-shadow-md"
                              />
                            ) : (
                              <div className="text-center space-y-1">
                                <ImageIcon className="w-8 h-8 text-slate-600 mx-auto" />
                                <span className="text-[11px] text-slate-500 block">Belum ada logo terpasang (Memakai default ⚽)</span>
                              </div>
                            )}
                          </div>

                          {/* Upload / URL Options */}
                          <div className="space-y-2">
                            <label className="block text-[11px] font-bold text-slate-400 uppercase">
                              Unggah File Logo (PNG / JPG / WebP / SVG):
                            </label>
                            <label className="flex items-center justify-center space-x-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-bold text-slate-200 cursor-pointer transition">
                              <Upload className="w-4 h-4 text-red-500" />
                              <span>Pilih File Dari Komputer / HP</span>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={handleWabupLogoUpload}
                                className="hidden"
                              />
                            </label>
                          </div>

                          <div className="space-y-1">
                            <label className="block text-[11px] font-bold text-slate-400 uppercase">
                              Atau Masukkan URL Logo Eksternal:
                            </label>
                            <input
                              type="text"
                              value={generalConfigForm.wabupLogoUrl}
                              onChange={e => {
                                setGeneralConfigForm({ ...generalConfigForm, wabupLogoUrl: e.target.value });
                                updateConfig({ wabupLogoUrl: e.target.value });
                              }}
                              placeholder="/api/media/view/... atau https://..."
                              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-red-500"
                            />
                          </div>
                        </div>

                        {/* 2. LOGO PANITIA */}
                        <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-4">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-200 uppercase">
                              2. Logo Panitia Penyelenggara (Askab / Pemda)
                            </span>
                            {generalConfigForm.panitiaLogoUrl && (
                              <button
                                type="button"
                                onClick={handleRemovePanitiaLogo}
                                className="text-[11px] font-semibold text-rose-400 hover:text-rose-300 hover:underline flex items-center space-x-1 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Hapus Logo</span>
                              </button>
                            )}
                          </div>

                          {/* Preview Frame */}
                          <div className="w-full h-32 rounded-xl bg-slate-900 border border-dashed border-slate-700 flex items-center justify-center p-3 overflow-hidden relative group">
                            {generalConfigForm.panitiaLogoUrl ? (
                              <img loading="lazy"
                                src={generalConfigForm.panitiaLogoUrl}
                                alt="Preview Logo Panitia"
                                className="max-h-full max-w-full object-contain filter drop-shadow-md"
                              />
                            ) : (
                              <div className="text-center space-y-1">
                                <Shield className="w-8 h-8 text-slate-600 mx-auto" />
                                <span className="text-[11px] text-slate-500 block">Belum ada logo panitia terpasang</span>
                              </div>
                            )}
                          </div>

                          {/* Upload / URL Options */}
                          <div className="space-y-2">
                            <label className="block text-[11px] font-bold text-slate-400 uppercase">
                              Unggah File Logo (PNG / JPG / WebP / SVG):
                            </label>
                            <label className="flex items-center justify-center space-x-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-bold text-slate-200 cursor-pointer transition">
                              <Upload className="w-4 h-4 text-blue-500" />
                              <span>Pilih File Dari Komputer / HP</span>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={handlePanitiaLogoUpload}
                                className="hidden"
                              />
                            </label>
                          </div>

                          <div className="space-y-1">
                            <label className="block text-[11px] font-bold text-slate-400 uppercase">
                              Atau Masukkan URL Logo Eksternal:
                            </label>
                            <input
                              type="text"
                              value={generalConfigForm.panitiaLogoUrl}
                              onChange={e => {
                                setGeneralConfigForm({ ...generalConfigForm, panitiaLogoUrl: e.target.value });
                                updateConfig({ panitiaLogoUrl: e.target.value });
                              }}
                              placeholder="/api/media/view/... atau https://..."
                              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end pt-4 border-t border-slate-800">
                      <button
                        type="submit"
                        className="px-6 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition flex items-center space-x-2 shadow-lg shadow-red-950/60 cursor-pointer"
                      >
                        <Save className="w-4 h-4" />
                        <span>Simpan Pengaturan Turnamen</span>
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          )}

        </main>
      </div>

      {/* FOOTER STATUS BAR - PROFESSIONAL POLISH */}
      <footer className="h-8 bg-[#111827] border-t border-slate-800 flex items-center justify-between px-6 shrink-0 text-[11px] text-slate-400">
        <div className="flex items-center space-x-4">
          <span className="flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span className="font-mono text-slate-300">System Ready</span>
          </span>
          <span className="hidden sm:inline text-slate-600">|</span>
          <span className="hidden sm:inline font-mono">Operator: {currentAdmin.fullName} ({currentAdmin.role})</span>
        </div>
        <div className="flex items-center space-x-4 font-mono">
          <span>v2.6.0-PRO</span>
          <span className="text-red-500 font-bold">WABUPCUP 2026</span>
        </div>
      </footer>

      {/* PDF VIEWER MODAL */}
      <PdfViewerModal
        isOpen={pdfModalOpen}
        onClose={() => setPdfModalOpen(false)}
        document={selectedDoc}
        documentTitle={selectedDocTitle}
        teamName={selectedTeamName}
      />

      {/* INVOICE & KUITANSI RESMI MODAL (CAP WABUP CUP 2026 & TTD KETUA PANITIA) */}
      <InvoiceModal
        isOpen={isInvoiceModalOpen}
        onClose={() => {
          setIsInvoiceModalOpen(false);
          setSelectedInvoiceItem(null);
        }}
        item={selectedInvoiceItem}
        config={config}
      />

      {/* SPONSOR MODAL (TAMBAH / EDIT SPONSOR DENGAN UPLOAD & LINK) */}
      {sponsorModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 text-white space-y-6 shadow-2xl animate-fadeIn">
            {/* MODAL HEADER */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h4 className="text-xl font-heading font-bold text-white uppercase tracking-wide">
                  {editingSponsor ? 'Edit Data Sponsor' : 'Tambah Sponsor Baru'}
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Lengkapi identitas, logo (upload/link), serta link website resmi mitra sponsor.
                </p>
              </div>
              <button
                onClick={() => setSponsorModalOpen(false)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSponsor} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* NAMA SPONSOR */}
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Nama Sponsor / Perusahaan <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={sponsorForm.name}
                    onChange={e => setSponsorForm({ ...sponsorForm, name: e.target.value })}
                    placeholder="Contoh: Bank Nagari, Pocari Sweat, Pemkab Wijaya"
                    className="w-full bg-slate-950 border border-slate-700 focus:border-red-500 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none"
                  />
                </div>

                {/* TINGKATAN / TIER */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Tingkatan Sponsor (Tier)
                  </label>
                  <select
                    value={sponsorForm.tier}
                    onChange={e => setSponsorForm({ ...sponsorForm, tier: e.target.value as SponsorTier })}
                    className="w-full bg-slate-950 border border-slate-700 focus:border-red-500 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none font-bold"
                  >
                    <option value="PLATINUM">🌟 PLATINUM (Utama)</option>
                    <option value="GOLD">🥇 GOLD (Partner Resmi)</option>
                    <option value="SILVER">🥈 SILVER (Pendukung)</option>
                    <option value="OFFICIAL_PARTNER">🤝 OFFICIAL PARTNER (Media & Medis)</option>
                  </select>
                </div>

                {/* INISIAL / LOGO TEXT */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Inisial / Monogram Cadangan
                  </label>
                  <input
                    type="text"
                    value={sponsorForm.logoText}
                    onChange={e => setSponsorForm({ ...sponsorForm, logoText: e.target.value })}
                    placeholder="Contoh: BN, POCARI, PEMKAB"
                    className="w-full bg-slate-950 border border-slate-700 focus:border-red-500 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none uppercase"
                  />
                </div>

                {/* WEBSITE / INSTAGRAM URL */}
                <div className="space-y-1.5 sm:col-span-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                      Tautan Website / Instagram Sponsor
                    </label>
                    {sponsorForm.websiteUrl && (
                      <a
                        href={
                          sponsorForm.websiteUrl.startsWith('@')
                            ? `https://instagram.com/${sponsorForm.websiteUrl.slice(1)}`
                            : sponsorForm.websiteUrl.startsWith('http')
                            ? sponsorForm.websiteUrl
                            : `https://${sponsorForm.websiteUrl}`
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center space-x-1"
                      >
                        <span>Uji Tautan</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                      <Globe className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      value={sponsorForm.websiteUrl}
                      onChange={e => setSponsorForm({ ...sponsorForm, websiteUrl: e.target.value })}
                      placeholder="Contoh: https://instagram.com/brand atau https://brand.com atau @brand"
                      className="w-full bg-slate-950 border border-slate-700 focus:border-red-500 rounded-xl pl-10 pr-4 py-2.5 text-xs text-blue-400 placeholder-slate-500 focus:outline-none"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 italic">
                    Bisa berupa URL website resmi atau tautan akun Instagram sponsor. Saat logo di klik oleh pengunjung, halaman akan langsung diarahkan ke tautan ini.
                  </p>
                </div>

                {/* DESKRIPSI / SLOGAN */}
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Deskripsi / Peran Sponsor
                  </label>
                  <input
                    type="text"
                    value={sponsorForm.description}
                    onChange={e => setSponsorForm({ ...sponsorForm, description: e.target.value })}
                    placeholder="Contoh: Official Hydration Partner & Match Ball Sponsor"
                    className="w-full bg-slate-950 border border-slate-700 focus:border-red-500 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* LOGO IMAGE METHOD (UPLOAD / URL LINK) */}
              <div className="space-y-3 p-4 rounded-2xl bg-slate-950/70 border border-slate-800">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center space-x-2">
                    <ImageIcon className="w-4 h-4 text-red-400" />
                    <span>Logo Gambar Sponsor</span>
                  </label>

                  {/* TAB PILIHAN METODE */}
                  <div className="flex bg-slate-900 rounded-lg p-0.5 border border-slate-800 text-[11px] font-bold">
                    <button
                      type="button"
                      onClick={() => setSponsorLogoType('UPLOAD')}
                      className={`px-3 py-1 rounded-md transition ${
                        sponsorLogoType === 'UPLOAD'
                          ? 'bg-red-600 text-white shadow'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Upload File
                    </button>
                    <button
                      type="button"
                      onClick={() => setSponsorLogoType('URL')}
                      className={`px-3 py-1 rounded-md transition ${
                        sponsorLogoType === 'URL'
                          ? 'bg-red-600 text-white shadow'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Link URL Gambar
                    </button>
                  </div>
                </div>

                {/* METODE 1: UPLOAD FILE */}
                {sponsorLogoType === 'UPLOAD' && (
                  <div className="space-y-3">
                    <label className="block border-2 border-dashed border-slate-700 hover:border-red-500/70 rounded-xl p-4 text-center cursor-pointer transition bg-slate-900/40">
                      <input
                        type="file"
                        accept="image/png, image/jpeg, image/jpg, image/webp, image/svg+xml"
                        onChange={handleSponsorFileUpload}
                        className="hidden"
                      />
                      <Upload className="w-7 h-7 text-slate-400 mx-auto mb-2" />
                      <p className="text-xs font-bold text-slate-200">
                        Klik untuk upload logo gambar (PNG, JPG, WebP, SVG)
                      </p>
                      <p className="text-[10px] text-slate-500 mt-1">
                        Maksimal ukuran 5 MB. Transparan PNG sangat disarankan.
                      </p>
                    </label>
                  </div>
                )}

                {/* METODE 2: LINK URL */}
                {sponsorLogoType === 'URL' && (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={sponsorForm.logoUrl}
                      onChange={e => {
                        setSponsorForm({ ...sponsorForm, logoUrl: e.target.value });
                        setSponsorLogoPreview(e.target.value);
                      }}
                      placeholder="/api/media/view/... atau https://..."
                      className="w-full bg-slate-900 border border-slate-700 focus:border-red-500 rounded-xl px-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none"
                    />
                    <p className="text-[10px] text-slate-400">
                      Masukkan direct URL gambar logo sponsor dari web hosting atau CDN.
                    </p>
                  </div>
                )}

                {/* LIVE PREVIEW LOGO */}
                {(sponsorLogoPreview || sponsorForm.logoUrl) && (
                  <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900 border border-slate-800">
                    <div className="flex items-center space-x-3">
                      <div className="w-14 h-14 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-center p-1.5 overflow-hidden">
                        <img loading="lazy"
                          src={sponsorLogoPreview || sponsorForm.logoUrl}
                          alt="Preview Logo"
                          className="max-h-full max-w-full object-contain"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-emerald-400 flex items-center space-x-1">
                          <Check className="w-3.5 h-3.5" />
                          <span>Logo Gambar Terpasang</span>
                        </span>
                        <p className="text-[10px] text-slate-400">
                          {sponsorLogoPreview.startsWith('data:') ? 'File Gambar Lokal (Base64)' : 'URL Eksternal'}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setSponsorLogoPreview('');
                        setSponsorForm(prev => ({ ...prev, logoUrl: '' }));
                      }}
                      className="px-2.5 py-1 rounded-lg bg-rose-950/60 hover:bg-rose-900 text-rose-300 text-xs font-bold transition flex items-center space-x-1"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Hapus Gambar</span>
                    </button>
                  </div>
                )}
              </div>

              {/* LIVE CARD PREVIEW CONTAINER */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Pratinjau Kartu di Landing Page:
                </span>
                <div className="p-4 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-center p-2">
                      {sponsorLogoPreview || sponsorForm.logoUrl ? (
                        <img loading="lazy"
                          src={sponsorLogoPreview || sponsorForm.logoUrl}
                          alt="Preview"
                          className="max-h-full max-w-full object-contain"
                        />
                      ) : (
                        <span className="font-bold text-sm text-red-500">
                          {(sponsorForm.logoText || sponsorForm.name || 'SP').slice(0, 2).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div>
                      <h5 className="font-bold text-sm text-white">
                        {sponsorForm.name || 'Nama Sponsor Anda'}
                      </h5>
                      <p className="text-xs text-slate-400">
                        {sponsorForm.description || 'Deskripsi singkat mitra'}
                      </p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    {sponsorForm.tier}
                  </span>
                </div>
              </div>

              {/* FORM ACTIONS */}
              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setSponsorModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-xs font-bold text-white transition shadow-lg shadow-red-950/50 flex items-center space-x-2 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>{editingSponsor ? 'Simpan Perubahan' : 'Tambahkan Sponsor'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REJECTION REASON MODAL */}
      {rejectModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 text-white space-y-4 shadow-2xl">
            <h4 className="text-lg font-bold text-rose-400 uppercase">
              Tolak / Minta Perbaikan Berkas
            </h4>
            <p className="text-xs text-slate-400">
              Tuliskan alasan penolakan atau instruksi perbaikan berkas untuk tim <strong className="text-white">{targetRejectItem?.teamName}</strong>.
            </p>

            <textarea
              rows={4}
              value={rejectionReasonText}
              onChange={e => setRejectionReasonText(e.target.value)}
              placeholder="Contoh: Akta kelahiran belum dilegalisir, terdapat 2 pemain melebihi batas usia 2014..."
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
            ></textarea>

            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setRejectModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 text-xs font-semibold"
              >
                Batal
              </button>
              <button
                onClick={handleConfirmReject}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-bold"
              >
                Konfirmasi Penolakan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 1. MODAL: TAMBAH / EDIT BERKAS UNDUHAN */}
      {docModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 text-white space-y-5 shadow-2xl animate-fadeIn">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <FolderDown className="w-5 h-5 text-cyan-400" />
                <h4 className="text-base font-bold text-white uppercase">
                  {editingDoc ? 'Edit Berkas Unduhan' : 'Tambah Berkas Unduhan Baru'}
                </h4>
              </div>
              <button
                onClick={() => setDocModalOpen(false)}
                className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveDoc} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-slate-300">Nama / Judul Berkas *</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Formulir Pendaftaran Tim & Surat Pernyataan"
                  value={docForm.title}
                  onChange={e => setDocForm({ ...docForm, title: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-300">Kategori Berkas</label>
                  <input
                    type="text"
                    placeholder="Contoh: Formulir, Regulasi, Template Surat"
                    value={docForm.category}
                    onChange={e => setDocForm({ ...docForm, category: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-300">Format File</label>
                  <select
                    value={docForm.fileType}
                    onChange={e => setDocForm({ ...docForm, fileType: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  >
                    <option value="PDF">PDF (Dokumen Portabel)</option>
                    <option value="DOCX">DOCX (Word Document)</option>
                    <option value="XLSX">XLSX (Excel Spreadsheet)</option>
                    <option value="ZIP">ZIP (Arsip Berkas)</option>
                    <option value="IMAGE">IMAGE (PNG/JPG)</option>
                    <option value="OTHER">Lainnya</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-300">Deskripsi Singkat</label>
                <textarea
                  rows={2}
                  placeholder="Keterangan singkat tentang isi dokumen..."
                  value={docForm.description}
                  onChange={e => setDocForm({ ...docForm, description: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                ></textarea>
              </div>

              {/* METODE BERKAS: UPLOAD ATAU URL */}
              <div className="space-y-2 pt-1 border-t border-slate-800">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-300">Sumber File</label>
                  <div className="flex rounded-lg bg-slate-950 p-0.5 border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setDocFileSource('UPLOAD')}
                      className={`px-3 py-1 rounded-md text-[11px] font-semibold transition ${
                        docFileSource === 'UPLOAD' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Upload File
                    </button>
                    <button
                      type="button"
                      onClick={() => setDocFileSource('URL')}
                      className={`px-3 py-1 rounded-md text-[11px] font-semibold transition ${
                        docFileSource === 'URL' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Link URL / G-Drive
                    </button>
                  </div>
                </div>

                {docFileSource === 'UPLOAD' ? (
                  <div className="space-y-2">
                    <label className={`flex flex-col items-center justify-center p-4 border-2 border-dashed rounded-2xl transition ${
                      docUploading ? 'border-cyan-500/50 bg-cyan-950/20 cursor-wait' : 'border-slate-700 hover:border-cyan-500 bg-slate-950/60 cursor-pointer'
                    }`}>
                      {docUploading ? (
                        <div className="flex flex-col items-center py-2 space-y-2">
                          <div className="w-8 h-8 border-3 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
                          <span className="text-xs font-semibold text-cyan-300">
                            Mengunggah ke TiDB Cloud ({docUploadProgress}%)...
                          </span>
                          <div className="w-48 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                            <div className="bg-cyan-500 h-full transition-all duration-300" style={{ width: `${docUploadProgress}%` }}></div>
                          </div>
                        </div>
                      ) : (
                        <>
                          <FolderDown className="w-8 h-8 text-cyan-400 mb-1" />
                          <span className="text-xs font-semibold text-slate-300 text-center">
                            {docForm.fileName ? `Terpilih: ${docForm.fileName}` : 'Klik untuk pilih file berkas (PDF, DOCX, XLSX, dll)'}
                          </span>
                          <span className="text-[10px] text-slate-500 mt-0.5">
                            Maksimal 4 MB langsung ke TiDB Cloud (atau gunakan tab Link G-Drive jika &gt; 4 MB)
                          </span>
                        </>
                      )}
                      <input
                        type="file"
                        onChange={handleDocFileUpload}
                        disabled={docUploading}
                        className="hidden"
                      />
                    </label>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <input
                      type="text"
                      placeholder="https://drive.google.com/file/d/... atau URL langsung"
                      value={docForm.fileUrl}
                      onChange={e => setDocForm({ ...docForm, fileUrl: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <input
                        type="text"
                        placeholder="Nama file: Formulir.pdf"
                        value={docForm.fileName}
                        onChange={e => setDocForm({ ...docForm, fileName: e.target.value })}
                        className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white"
                      />
                      <input
                        type="text"
                        placeholder="Ukuran: 1.5 MB"
                        value={docForm.fileSize}
                        onChange={e => setDocForm({ ...docForm, fileSize: e.target.value })}
                        className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* PRIMARY TOGGLE */}
              <div className="flex items-center space-x-2 pt-2">
                <input
                  type="checkbox"
                  id="docIsPrimary"
                  checked={docForm.isPrimary}
                  onChange={e => setDocForm({ ...docForm, isPrimary: e.target.checked })}
                  className="rounded border-slate-700 text-cyan-500 focus:ring-cyan-500 w-4 h-4 cursor-pointer"
                />
                <label htmlFor="docIsPrimary" className="text-xs text-slate-300 cursor-pointer">
                  Jadikan <strong>Unduhan Utama</strong> (tampil paling menonjol di halaman pendaftaran)
                </label>
              </div>

              <div className="flex justify-end space-x-2 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setDocModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white font-semibold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={docUploading}
                  className={`px-5 py-2 rounded-xl font-bold transition flex items-center space-x-1.5 cursor-pointer ${
                    docUploading ? 'bg-slate-700 text-slate-400 cursor-not-allowed' : 'bg-cyan-600 hover:bg-cyan-500 text-white'
                  }`}
                >
                  <Save className="w-4 h-4" />
                  <span>{docUploading ? 'Sedang Mengunggah...' : 'Simpan Berkas'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. MODAL: TAMBAH / EDIT KONTAK WHATSAPP */}
      {contactModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 text-white space-y-5 shadow-2xl animate-fadeIn">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <Phone className="w-5 h-5 text-emerald-400" />
                <h4 className="text-base font-bold text-white uppercase">
                  {editingContact ? 'Edit Kontak WhatsApp' : 'Tambah Kontak WhatsApp Panitia'}
                </h4>
              </div>
              <button
                onClick={() => setContactModalOpen(false)}
                className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveContact} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-slate-300">Nama Lengkap / Jabatan *</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Rahmat Fauzi (Sekretariat Turnamen)"
                  value={contactForm.name}
                  onChange={e => setContactForm({ ...contactForm, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-300">Nomor WhatsApp *</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: 081267891234 atau +6281267891234"
                  value={contactForm.phone}
                  onChange={e => setContactForm({ ...contactForm, phone: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-300">Divisi / Peran Panitia</label>
                <input
                  type="text"
                  placeholder="Contoh: Pendaftaran & Pembayaran, Teknis Pertandingan, Sponsorship"
                  value={contactForm.role}
                  onChange={e => setContactForm({ ...contactForm, role: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <input
                  type="checkbox"
                  id="contactIsPrimary"
                  checked={contactForm.isPrimary}
                  onChange={e => setContactForm({ ...contactForm, isPrimary: e.target.checked })}
                  className="rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                />
                <label htmlFor="contactIsPrimary" className="text-xs text-slate-300 cursor-pointer">
                  Jadikan <strong>Kontak Utama</strong> untuk konfirmasi pendaftaran
                </label>
              </div>

              <div className="flex justify-end space-x-2 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setContactModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white font-semibold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition flex items-center space-x-1.5 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>Simpan Kontak</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. MODAL: TAMBAH / EDIT EMAIL RESMI */}
      {emailModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 text-white space-y-5 shadow-2xl animate-fadeIn">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <Mail className="w-5 h-5 text-blue-400" />
                <h4 className="text-base font-bold text-white uppercase">
                  {editingEmail ? 'Edit Email Panitia' : 'Tambah Email Resmi Panitia'}
                </h4>
              </div>
              <button
                onClick={() => setEmailModalOpen(false)}
                className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEmail} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-slate-300">Nama Divisi / Bagian *</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Sekretariat Panitia Pelaksana, Divisi Humas"
                  value={emailForm.title}
                  onChange={e => setEmailForm({ ...emailForm, title: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-300">Alamat Email *</label>
                <input
                  type="email"
                  required
                  placeholder="panitia@wabupcup.id atau panitiawabupcup2026@gmail.com"
                  value={emailForm.email}
                  onChange={e => setEmailForm({ ...emailForm, email: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <input
                  type="checkbox"
                  id="emailIsPrimary"
                  checked={emailForm.isPrimary}
                  onChange={e => setEmailForm({ ...emailForm, isPrimary: e.target.checked })}
                  className="rounded border-slate-700 text-blue-500 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                />
                <label htmlFor="emailIsPrimary" className="text-xs text-slate-300 cursor-pointer">
                  Jadikan <strong>Email Utama</strong>
                </label>
              </div>

              <div className="flex justify-end space-x-2 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEmailModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white font-semibold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition flex items-center space-x-1.5 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>Simpan Email</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. MODAL: TAMBAH / EDIT REKENING BANK */}
      {bankModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 text-white space-y-5 shadow-2xl animate-fadeIn">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <CreditCard className="w-5 h-5 text-amber-400" />
                <h4 className="text-base font-bold text-white uppercase">
                  {editingBank ? 'Edit Rekening Bank' : 'Tambah Rekening Bank Pembayaran'}
                </h4>
              </div>
              <button
                onClick={() => setBankModalOpen(false)}
                className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveBank} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-slate-300">Nama Bank / E-Wallet *</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Bank Nagari, BRI, Mandiri, BCA"
                  value={bankForm.bankName}
                  onChange={e => setBankForm({ ...bankForm, bankName: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-300">Nomor Rekening *</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: 1200.0210.12345.6"
                  value={bankForm.accountNumber}
                  onChange={e => setBankForm({ ...bankForm, accountNumber: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono tracking-wider"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-300">Atas Nama (a/n) *</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: PANITIA WABUP CUP 2026"
                  value={bankForm.accountHolder}
                  onChange={e => setBankForm({ ...bankForm, accountHolder: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-300">Kantor Cabang</label>
                <input
                  type="text"
                  placeholder="Contoh: Cabang Utama Solok Selatan"
                  value={bankForm.branchName}
                  onChange={e => setBankForm({ ...bankForm, branchName: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-300">Instruksi Pembayaran / Catatan</label>
                <input
                  type="text"
                  placeholder="Contoh: Sertakan nama tim pada berita transfer"
                  value={bankForm.instructions}
                  onChange={e => setBankForm({ ...bankForm, instructions: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <input
                  type="checkbox"
                  id="bankIsPrimary"
                  checked={bankForm.isPrimary}
                  onChange={e => setBankForm({ ...bankForm, isPrimary: e.target.checked })}
                  className="rounded border-slate-700 text-amber-500 focus:ring-amber-500 w-4 h-4 cursor-pointer"
                />
                <label htmlFor="bankIsPrimary" className="text-xs text-slate-300 cursor-pointer">
                  Jadikan <strong>Rekening Utama</strong> untuk pembayaran pendaftaran
                </label>
              </div>

              <div className="flex justify-end space-x-2 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setBankModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white font-semibold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold transition flex items-center space-x-1.5 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>Simpan Rekening</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. MODAL: SUPER ADMIN EDIT REGISTRASI LENGKAP & BERKAS DOKUMEN & LOGO TIM */}
      {editRegModalOpen && editingReg && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 text-white space-y-6 shadow-2xl animate-fadeIn max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
                  <Edit className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-white uppercase">
                    Edit Data Pendaftar & Berkas Tim (Super Admin)
                  </h4>
                  <p className="text-xs text-slate-400">
                    ID Pendaftaran: <span className="font-mono text-slate-300">{editingReg.id}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setEditRegModalOpen(false)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditReg} className="space-y-6 text-xs">
              {/* SECTION 1: LOGO TIM */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-200 uppercase tracking-wider flex items-center space-x-2">
                    <ImageIcon className="w-4 h-4 text-amber-400" />
                    <span>Logo Resmi Tim</span>
                  </label>
                  {regForm.teamLogo && (
                    <button
                      type="button"
                      onClick={handleRemoveRegLogo}
                      className="text-[11px] text-rose-400 hover:underline cursor-pointer"
                    >
                      Hapus Logo
                    </button>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <div className="w-20 h-20 rounded-2xl bg-slate-900 border border-dashed border-slate-700 flex items-center justify-center p-2 overflow-hidden shrink-0">
                    {uploadingLogo ? (
                      <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
                    ) : regForm.teamLogo ? (
                      <img loading="lazy" src={regForm.teamLogo} alt="Logo Tim" className="max-h-full max-w-full object-contain" />
                    ) : (
                      <span className="text-2xl">🛡️</span>
                    )}
                  </div>

                  <div className="flex-1 w-full space-y-2">
                    <label className={`flex items-center justify-center space-x-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-bold text-slate-200 cursor-pointer transition ${uploadingLogo ? 'opacity-50 pointer-events-none' : ''}`}>
                      {uploadingLogo ? (
                        <>
                          <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
                          <span>Mengunggah Logo ke TiDB Storage...</span>
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4 text-blue-400" />
                          <span>{regForm.teamLogo ? 'Ganti File Logo Tim' : 'Unggah File Logo Tim'}</span>
                          <input
                            type="file"
                            accept="image/*"
                            disabled={uploadingLogo}
                            onChange={handleRegTeamLogoUpload}
                            className="hidden"
                          />
                        </>
                      )}
                    </label>
                    <input
                      type="text"
                      value={regForm.teamLogo}
                      onChange={e => {
                        const val = e.target.value.trim();
                        if (val.includes('/api/media/view/')) {
                          setRegForm(prev => ({ ...prev, teamLogo: val.substring(val.indexOf('/api/media/view/')) }));
                        } else if (/^med-\d+-[a-zA-Z0-9_-]+$/i.test(val)) {
                          setRegForm(prev => ({ ...prev, teamLogo: `/api/media/view/${val}` }));
                        } else {
                          setRegForm(prev => ({ ...prev, teamLogo: e.target.value }));
                        }
                      }}
                      placeholder="Link logo: /api/media/view/..., ID med-xxx, atau URL"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono text-[11px]"
                    />
                    <p className="text-[10px] text-slate-500">
                      Mendukung link relatif (<code className="text-amber-400">/api/media/view/...</code>), ID berkas (<code className="text-amber-400">med-xxx</code>), atau URL lengkap.
                    </p>
                  </div>
                </div>
              </div>

              {/* SECTION 2: IDENTITAS TIM & OFFICIAL */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="font-bold text-slate-300">Nama Tim / Sekolah / Instansi *</label>
                  <input
                    type="text"
                    required
                    value={regForm.teamName}
                    onChange={e => setRegForm({ ...regForm, teamName: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-300">Kategori Turnamen *</label>
                  <select
                    value={regForm.category}
                    onChange={e => setRegForm({ ...regForm, category: e.target.value as TournamentCategory })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {(['SD', 'SMP', 'SMA', 'INSTANSI', 'UMUM', 'DESA'] as TournamentCategory[]).map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-300">Nama Asal Lembaga / Desa</label>
                  <input
                    type="text"
                    value={regForm.institutionName}
                    onChange={e => setRegForm({ ...regForm, institutionName: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-300">Nama Official / Pelatih Penanggung Jawab *</label>
                  <input
                    type="text"
                    required
                    value={regForm.coachName}
                    onChange={e => setRegForm({ ...regForm, coachName: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-300">No. WhatsApp Official *</label>
                  <input
                    type="tel"
                    required
                    value={regForm.coachPhone}
                    onChange={e => setRegForm({ ...regForm, coachPhone: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-300">Email Official</label>
                  <input
                    type="email"
                    value={regForm.coachEmail}
                    onChange={e => setRegForm({ ...regForm, coachEmail: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* SECTION 3: STATUS REGISTRASI & STATUS PEMBAYARAN */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="font-bold text-slate-300">Status Registrasi</label>
                  <select
                    value={regForm.status}
                    onChange={e => setRegForm({ ...regForm, status: e.target.value as RegistrationStatus })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="APPROVED">✅ APPROVED (Disetujui)</option>
                    <option value="PENDING_PAYMENT">⏳ PENDING_PAYMENT (Menunggu Bayar)</option>
                    <option value="REJECTED">❌ REJECTED (Ditolak / Perbaikan)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-300">Status Pembayaran</label>
                  <select
                    value={regForm.paymentStatus}
                    onChange={e => setRegForm({ ...regForm, paymentStatus: e.target.value as PaymentStatus })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="PAID">🟢 PAID (Lunas)</option>
                    <option value="VERIFYING">🟡 VERIFYING (Cek Bukti Transfer)</option>
                    <option value="UNPAID">🔴 UNPAID (Belum Bayar)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-300">Nominal Biaya (Rp)</label>
                  <input
                    type="number"
                    value={regForm.paymentAmount}
                    onChange={e => setRegForm({ ...regForm, paymentAmount: Number(e.target.value) })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* SECTION 4: BERKAS DOKUMEN & PERSYARATAN (SESUAI KATEGORI TIM) */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <h5 className="font-bold text-white uppercase tracking-wider flex items-center space-x-2">
                    <FileText className="w-4 h-4 text-blue-400" />
                    <span>Berkas Persyaratan Kategori: <span className="text-blue-400 font-extrabold">{regForm.category}</span></span>
                  </h5>
                  <span className="text-[11px] text-slate-400">
                    Format: PDF, PNG, JPG (Maks 15 MB)
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {/* Dokumen Wajib Dinamis Sesuai Kategori Pendaftar */}
                  {getRequiredDocsForCategory(regForm.category).map((req, idx) => {
                    const doc = regForm[req.key as keyof typeof regForm] as UploadedDoc | undefined;
                    const info = getDocDisplayInfo(req.key, regForm.category);

                    return (
                      <div key={req.key} className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-bold text-slate-200 block text-xs">{idx + 1}. {req.label}</span>
                            <span className="text-[10px] text-blue-400 font-semibold">Wajib ({regForm.category})</span>
                          </div>
                          {doc ? (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 font-semibold">✓ Terunggah</span>
                          ) : (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-red-950 text-red-400 border border-red-900/60 font-semibold">✕ Belum Ada</span>
                          )}
                        </div>
                        {doc && (
                          <p className="text-[11px] text-slate-400 font-mono truncate">{doc.name} {doc.size ? `(${doc.size})` : ''}</p>
                        )}
                        <div className="flex items-center gap-1.5 pt-1">
                          {doc && (
                            <button
                              type="button"
                              onClick={() => handleOpenPdf(doc, info.title, regForm.teamName)}
                              className="px-2.5 py-1 rounded-lg bg-blue-950/80 hover:bg-blue-900 text-blue-300 border border-blue-800/60 text-[11px] font-semibold flex items-center space-x-1 cursor-pointer"
                            >
                              <Eye className="w-3 h-3" />
                              <span>Lihat</span>
                            </button>
                          )}
                          <label className={`flex-1 flex items-center justify-center space-x-1.5 px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-semibold text-slate-300 cursor-pointer ${uploadingDocs[req.key] ? 'opacity-50 pointer-events-none' : ''}`}>
                            {uploadingDocs[req.key] ? (
                              <>
                                <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />
                                <span>Mengunggah...</span>
                              </>
                            ) : (
                              <>
                                <Upload className="w-3 h-3 text-blue-400" />
                                <span>{doc ? 'Ganti' : 'Unggah'}</span>
                                <input
                                  type="file"
                                  accept=".pdf,.png,.jpg,.jpeg,.xlsx,.docx"
                                  disabled={uploadingDocs[req.key]}
                                  onChange={e => handleRegDocUpload(req.key as keyof typeof regForm, e)}
                                  className="hidden"
                                />
                              </>
                            )}
                          </label>
                          {doc && (
                            <button
                              type="button"
                              onClick={() => handleRemoveRegDoc(req.key as keyof typeof regForm)}
                              className="p-1 rounded-lg bg-red-950/60 hover:bg-red-900 text-red-400 border border-red-800/40 cursor-pointer"
                              title="Hapus berkas ini"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Dokumen Tambahan: Bukti Transfer Pembayaran */}
                  <div className="p-3.5 rounded-xl bg-slate-900 border border-emerald-900/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-bold text-slate-200 block text-xs">Bukti Transfer Pembayaran</span>
                        <span className="text-[10px] text-emerald-400 font-semibold">Semua Kategori (Wajib Transfer)</span>
                      </div>
                      {regForm.buktiPembayaran ? (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 font-semibold">✓ Terunggah</span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400">Belum Ada</span>
                      )}
                    </div>
                    {regForm.buktiPembayaran && (
                      <p className="text-[11px] text-slate-400 font-mono truncate">{regForm.buktiPembayaran.name} {regForm.buktiPembayaran.size ? `(${regForm.buktiPembayaran.size})` : ''}</p>
                    )}
                    <div className="flex items-center gap-1.5 pt-1">
                      {regForm.buktiPembayaran && (
                        <button
                          type="button"
                          onClick={() => handleOpenPdf(regForm.buktiPembayaran!, 'Bukti Transfer Pembayaran', regForm.teamName)}
                          className="px-2.5 py-1 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-800/60 text-[11px] font-semibold flex items-center space-x-1 cursor-pointer"
                        >
                          <Eye className="w-3 h-3" />
                          <span>Lihat</span>
                        </button>
                      )}
                      <label className={`flex-1 flex items-center justify-center space-x-1.5 px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-semibold text-slate-300 cursor-pointer ${uploadingDocs['buktiPembayaran'] ? 'opacity-50 pointer-events-none' : ''}`}>
                        {uploadingDocs['buktiPembayaran'] ? (
                          <>
                            <Loader2 className="w-3 h-3 text-emerald-400 animate-spin" />
                            <span>Mengunggah...</span>
                          </>
                        ) : (
                          <>
                            <Upload className="w-3 h-3 text-emerald-400" />
                            <span>{regForm.buktiPembayaran ? 'Ganti' : 'Unggah'}</span>
                            <input
                              type="file"
                              accept=".pdf,.png,.jpg,.jpeg"
                              disabled={uploadingDocs['buktiPembayaran']}
                              onChange={e => handleRegDocUpload('buktiPembayaran', e)}
                              className="hidden"
                            />
                          </>
                        )}
                      </label>
                      {regForm.buktiPembayaran && (
                        <button
                          type="button"
                          onClick={() => handleRemoveRegDoc('buktiPembayaran')}
                          className="p-1 rounded-lg bg-red-950/60 hover:bg-red-900 text-red-400 border border-red-800/40 cursor-pointer"
                          title="Hapus berkas ini"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Dokumen Tambahan: Logo Tim */}
                  <div className="p-3.5 rounded-xl bg-slate-900 border border-purple-900/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-bold text-slate-200 block text-xs">Logo Tim / Klub</span>
                        <span className="text-[10px] text-purple-400 font-semibold">Opsional (Visual Tim)</span>
                      </div>
                      {regForm.logoTim ? (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 font-semibold">✓ Terunggah</span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400">Belum Ada</span>
                      )}
                    </div>
                    {regForm.logoTim && (
                      <p className="text-[11px] text-slate-400 font-mono truncate">{regForm.logoTim.name} {regForm.logoTim.size ? `(${regForm.logoTim.size})` : ''}</p>
                    )}
                    <div className="flex items-center gap-1.5 pt-1">
                      {regForm.logoTim && (
                        <button
                          type="button"
                          onClick={() => handleOpenPdf(regForm.logoTim!, 'Logo Tim', regForm.teamName)}
                          className="px-2.5 py-1 rounded-lg bg-purple-950/80 hover:bg-purple-900 text-purple-300 border border-purple-800/60 text-[11px] font-semibold flex items-center space-x-1 cursor-pointer"
                        >
                          <Eye className="w-3 h-3" />
                          <span>Lihat</span>
                        </button>
                      )}
                      <label className={`flex-1 flex items-center justify-center space-x-1.5 px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-semibold text-slate-300 cursor-pointer ${uploadingDocs['logoTim'] ? 'opacity-50 pointer-events-none' : ''}`}>
                        {uploadingDocs['logoTim'] ? (
                          <>
                            <Loader2 className="w-3 h-3 text-purple-400 animate-spin" />
                            <span>Mengunggah...</span>
                          </>
                        ) : (
                          <>
                            <Upload className="w-3 h-3 text-purple-400" />
                            <span>{regForm.logoTim ? 'Ganti' : 'Unggah'}</span>
                            <input
                              type="file"
                              accept=".png,.jpg,.jpeg,.svg,.pdf"
                              disabled={uploadingDocs['logoTim']}
                              onChange={e => handleRegDocUpload('logoTim', e)}
                              className="hidden"
                            />
                          </>
                        )}
                      </label>
                      {regForm.logoTim && (
                        <button
                          type="button"
                          onClick={() => handleRemoveRegDoc('logoTim')}
                          className="p-1 rounded-lg bg-red-950/60 hover:bg-red-900 text-red-400 border border-red-800/40 cursor-pointer"
                          title="Hapus logo"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 5: CATATAN ADMIN / ALASAN PENOLAKAN */}
              <div className="space-y-1">
                <label className="font-bold text-slate-300">Catatan Admin / Alasan Penolakan (Jika Ada)</label>
                <textarea
                  rows={2}
                  value={regForm.rejectionReason}
                  onChange={e => setRegForm({ ...regForm, rejectionReason: e.target.value })}
                  placeholder="Contoh: Lampirkan kembali akta kelahiran yang lebih jelas..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* MODAL FOOTER BUTTONS */}
              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditRegModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white font-semibold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={uploadingLogo || Object.values(uploadingDocs).some(Boolean)}
                  className={`px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold transition flex items-center space-x-2 shadow-lg shadow-blue-900/40 cursor-pointer ${uploadingLogo || Object.values(uploadingDocs).some(Boolean) ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <Save className="w-4 h-4" />
                  <span>
                    {uploadingLogo || Object.values(uploadingDocs).some(Boolean)
                      ? 'Sedang Mengunggah Berkas...'
                      : 'Simpan Perubahan Pendaftar'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. MODAL: EDIT MATCH, SKOR OTOMATIS & SKOR PENALTI */}
      {editMatchModalOpen && editingMatch && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 text-white space-y-6 shadow-2xl animate-fadeIn">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-red-600/20 border border-red-500/40 flex items-center justify-center text-red-400">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-white uppercase">
                    Edit Match #{matchForm.matchNumber} • {matchForm.category}
                  </h4>
                  <p className="text-xs text-slate-400">
                    {matchForm.round} • {matchForm.pitch}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setEditMatchModalOpen(false)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditMatch} className="space-y-6 text-xs">
              {/* KATEGORI, STATUS & ROUND */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="font-bold text-slate-300">Kategori Turnamen</label>
                  <select
                    value={matchForm.category}
                    onChange={e => setMatchForm({ ...matchForm, category: e.target.value as TournamentCategory })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-bold focus:outline-none focus:ring-2 focus:ring-red-500"
                  >
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.id})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-300">Status Match</label>
                  <select
                    value={matchForm.status}
                    onChange={e => setMatchForm({ ...matchForm, status: e.target.value as MatchStatus })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-bold focus:outline-none focus:ring-2 focus:ring-red-500"
                  >
                    <option value="UPCOMING">UPCOMING (Belum Dimulai)</option>
                    <option value="LIVE">🔴 LIVE (Sedang Berlangsung)</option>
                    <option value="FINISHED">🏁 FINISHED (Selesai)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-300">Menit Match (Jika Live)</label>
                  <input
                    type="text"
                    value={matchForm.liveMinute}
                    onChange={e => setMatchForm({ ...matchForm, liveMinute: e.target.value })}
                    placeholder="Contoh: 45', Babak 2"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="font-bold text-slate-300">Babak Pertandingan</label>
                  <input
                    type="text"
                    value={matchForm.round}
                    onChange={e => setMatchForm({ ...matchForm, round: e.target.value })}
                    placeholder="Babak Penyisihan, 16 Besar, Perempat Final, Final"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-300">Nomor Pertandingan (Match #)</label>
                  <input
                    type="number"
                    min={1}
                    value={matchForm.matchNumber}
                    onChange={e => setMatchForm({ ...matchForm, matchNumber: Number(e.target.value) || 1 })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
              </div>

              {/* SCORE BOARD & PENALTIES */}
              <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-4">
                <h5 className="font-bold text-amber-400 uppercase tracking-wider text-center text-xs">
                  Papan Skor, Pilihan Tim Approved & Adu Penalti
                </h5>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                  {/* TIM A */}
                  <div className="space-y-3 p-4 rounded-xl bg-slate-900 border border-slate-800">
                    <div className="flex items-center justify-between">
                      <label className="font-bold text-red-400 uppercase block">Tim A (Tuan Rumah)</label>
                      <span className="text-[10px] text-slate-400">Kategori: {matchForm.category}</span>
                    </div>

                    {/* SELECTOR DARI TIM APPROVED */}
                    {approvedList.filter(t => t.category === matchForm.category).length > 0 && (
                      <div className="space-y-1 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
                        <label className="text-[10px] text-emerald-400 font-bold block flex items-center space-x-1">
                          <CheckCircle2 className="w-3 h-3 inline" />
                          <span>Pilih dari Tim Terverifikasi (Approved):</span>
                        </label>
                        <select
                          onChange={(e) => {
                            const found = approvedList.find(t => t.id === e.target.value);
                            if (found) {
                              setMatchForm(prev => ({
                                ...prev,
                                teamAName: found.teamName,
                                teamAInstitution: found.institutionName || '',
                                teamALogo: found.teamLogo || '',
                              }));
                            }
                          }}
                          defaultValue=""
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white"
                        >
                          <option value="" disabled>-- Pilih Tim A ({matchForm.category}) --</option>
                          {approvedList
                            .filter(t => t.category === matchForm.category)
                            .map(t => (
                              <option key={t.id} value={t.id}>
                                {t.teamName} ({t.institutionName})
                              </option>
                            ))}
                        </select>
                      </div>
                    )}

                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-400 font-bold block">Nama Tim A (Manual/Kustom):</label>
                      <input
                        type="text"
                        required
                        value={matchForm.teamAName}
                        onChange={e => setMatchForm({ ...matchForm, teamAName: e.target.value })}
                        placeholder="Nama Tim A"
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-bold"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-slate-400 font-bold block mb-1">Skor Utama</label>
                        <input
                          type="number"
                          min={0}
                          value={matchForm.teamAScore}
                          onChange={e => setMatchForm({ ...matchForm, teamAScore: Number(e.target.value) })}
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2 text-center text-xl font-mono font-bold text-red-400"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400 font-bold block mb-1">Adu Penalti (Opsional)</label>
                        <input
                          type="number"
                          min={0}
                          value={matchForm.teamAPenalties}
                          onChange={e => setMatchForm({ ...matchForm, teamAPenalties: e.target.value })}
                          placeholder="-"
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2 text-center text-base font-mono text-amber-300"
                        />
                      </div>
                    </div>
                  </div>

                  {/* TIM B */}
                  <div className="space-y-3 p-4 rounded-xl bg-slate-900 border border-slate-800">
                    <div className="flex items-center justify-between">
                      <label className="font-bold text-blue-400 uppercase block">Tim B (Tamu)</label>
                      <span className="text-[10px] text-slate-400">Kategori: {matchForm.category}</span>
                    </div>

                    {/* SELECTOR DARI TIM APPROVED */}
                    {approvedList.filter(t => t.category === matchForm.category).length > 0 && (
                      <div className="space-y-1 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
                        <label className="text-[10px] text-emerald-400 font-bold block flex items-center space-x-1">
                          <CheckCircle2 className="w-3 h-3 inline" />
                          <span>Pilih dari Tim Terverifikasi (Approved):</span>
                        </label>
                        <select
                          onChange={(e) => {
                            const found = approvedList.find(t => t.id === e.target.value);
                            if (found) {
                              setMatchForm(prev => ({
                                ...prev,
                                teamBName: found.teamName,
                                teamBInstitution: found.institutionName || '',
                                teamBLogo: found.teamLogo || '',
                              }));
                            }
                          }}
                          defaultValue=""
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white"
                        >
                          <option value="" disabled>-- Pilih Tim B ({matchForm.category}) --</option>
                          {approvedList
                            .filter(t => t.category === matchForm.category)
                            .map(t => (
                              <option key={t.id} value={t.id}>
                                {t.teamName} ({t.institutionName})
                              </option>
                            ))}
                        </select>
                      </div>
                    )}

                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-400 font-bold block">Nama Tim B (Manual/Kustom):</label>
                      <input
                        type="text"
                        required
                        value={matchForm.teamBName}
                        onChange={e => setMatchForm({ ...matchForm, teamBName: e.target.value })}
                        placeholder="Nama Tim B"
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-bold"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-slate-400 font-bold block mb-1">Skor Utama</label>
                        <input
                          type="number"
                          min={0}
                          value={matchForm.teamBScore}
                          onChange={e => setMatchForm({ ...matchForm, teamBScore: Number(e.target.value) })}
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2 text-center text-xl font-mono font-bold text-blue-400"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400 font-bold block mb-1">Adu Penalti (Opsional)</label>
                        <input
                          type="number"
                          min={0}
                          value={matchForm.teamBPenalties}
                          onChange={e => setMatchForm({ ...matchForm, teamBPenalties: e.target.value })}
                          placeholder="-"
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2 text-center text-base font-mono text-amber-300"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* WINNER DETERMINATION */}
                <div className="pt-2 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-2">
                  <span className="text-slate-400 text-xs">Pemenang Lolos ke Babak Selanjutnya:</span>
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => setMatchForm({ ...matchForm, winnerId: 'A' })}
                      className={`px-3 py-1.5 rounded-lg font-bold text-xs transition cursor-pointer ${
                        matchForm.winnerId === 'A'
                          ? 'bg-red-600 text-white'
                          : 'bg-slate-900 text-slate-400 border border-slate-800'
                      }`}
                    >
                      🏆 {matchForm.teamAName || 'Tim A'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setMatchForm({ ...matchForm, winnerId: 'B' })}
                      className={`px-3 py-1.5 rounded-lg font-bold text-xs transition cursor-pointer ${
                        matchForm.winnerId === 'B'
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-900 text-slate-400 border border-slate-800'
                      }`}
                    >
                      🏆 {matchForm.teamBName || 'Tim B'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setMatchForm({ ...matchForm, winnerId: 'DRAW' })}
                      className={`px-3 py-1.5 rounded-lg font-bold text-xs transition cursor-pointer ${
                        matchForm.winnerId === 'DRAW'
                          ? 'bg-amber-600 text-white'
                          : 'bg-slate-900 text-slate-400 border border-slate-800'
                      }`}
                    >
                      Otomatis / Seri
                    </button>
                  </div>
                </div>
              </div>

              {/* JADWAL & LOKASI */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="font-bold text-slate-300">Tanggal</label>
                  <input
                    type="date"
                    value={matchForm.date}
                    onChange={e => setMatchForm({ ...matchForm, date: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-300">Waktu Kick-Off</label>
                  <input
                    type="time"
                    value={matchForm.time}
                    onChange={e => setMatchForm({ ...matchForm, time: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-300">Lokasi Lapangan / Venue</label>
                  <input
                    type="text"
                    placeholder={config.venueName || 'Gedung Utama GOR Tawang Alun Banyuwangi'}
                    value={matchForm.pitch}
                    onChange={e => setMatchForm({ ...matchForm, pitch: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white"
                  />
                </div>
              </div>

              {/* MODAL FOOTER */}
              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditMatchModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white font-semibold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-slate-950 font-bold transition flex items-center space-x-2 shadow-lg shadow-red-900/40 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>Simpan Perubahan Match</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: TAMBAH / EDIT KATEGORI & RINCIAN HADIAH */}
      {categoryModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-3xl w-full p-6 sm:p-8 space-y-6 shadow-2xl my-8">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-red-600/20 text-red-500 flex items-center justify-center font-bold">
                  <Award className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-lg font-bold text-white uppercase">
                    {editingCategory ? `Edit Kategori: ${editingCategory.name} (${editingCategory.id})` : 'Tambah Kategori Turnamen Baru'}
                  </h4>
                  <p className="text-xs text-slate-400">
                    Kelola nama kategori, kuota, biaya, batas usia, rincian hadiah juara, dan regulasi turnamen.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setCategoryModalOpen(false)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCategoryModal} className="space-y-6 text-xs">
              {/* BASIC INFO */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="font-bold text-slate-300 uppercase text-[11px]">
                    Kode / ID Kategori <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    disabled={!!editingCategory}
                    value={categoryForm.id}
                    onChange={e => setCategoryForm({ ...categoryForm, id: e.target.value.toUpperCase() })}
                    placeholder="Contoh: U-10, VETERAN, PUTRI"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white font-mono font-bold focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-60"
                  />
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <label className="font-bold text-slate-300 uppercase text-[11px]">
                    Nama Lengkap Kategori <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={categoryForm.name}
                    onChange={e => setCategoryForm({ ...categoryForm, name: e.target.value })}
                    placeholder="Contoh: Usia Dini U-10 (Kelahiran 2014)"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white font-bold focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
              </div>

              {/* BATASAN USIA & DESKRIPSI */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="font-bold text-slate-300 uppercase text-[11px]">
                    Syarat & Batasan Usia
                  </label>
                  <input
                    type="text"
                    value={categoryForm.ageRestriction}
                    onChange={e => setCategoryForm({ ...categoryForm, ageRestriction: e.target.value })}
                    placeholder="Contoh: Kelahiran 1 Januari 2014 atau sesudahnya"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-300 uppercase text-[11px]">
                    Deskripsi Singkat (Opsional)
                  </label>
                  <input
                    type="text"
                    value={categoryForm.description}
                    onChange={e => setCategoryForm({ ...categoryForm, description: e.target.value })}
                    placeholder="Contoh: Kategori pembinaan bakat sepak bola usia dini"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
              </div>

              {/* FINANCIAL & QUOTA */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-2xl bg-slate-950 border border-slate-800">
                <div className="space-y-1">
                  <label className="font-bold text-amber-400 uppercase text-[11px]">
                    Kuota Maksimal (Tim)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={128}
                    required
                    value={categoryForm.maxTeams}
                    onChange={e => setCategoryForm({ ...categoryForm, maxTeams: Math.max(1, Number(e.target.value) || 1) })}
                    className="w-full bg-slate-900 border border-amber-500/50 rounded-xl px-3 py-2 text-white font-mono font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-300 uppercase text-[11px]">
                    Biaya Registrasi (Rp)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={categoryForm.registrationFee}
                    onChange={e => setCategoryForm({ ...categoryForm, registrationFee: Number(e.target.value) || 0 })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-red-400 uppercase text-[11px]">
                    Total Hadiah Pool (Rp)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={categoryForm.totalPrize}
                    onChange={e => setCategoryForm({ ...categoryForm, totalPrize: Number(e.target.value) || 0 })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-red-400 font-mono font-bold"
                  />
                </div>
              </div>

              {/* DAFTAR RINCIAN HADIAH JUARA (DYNAMIC) */}
              <div className="space-y-3 p-4 rounded-2xl bg-slate-950 border border-slate-800">
                <div className="flex items-center justify-between">
                  <div>
                    <h5 className="font-bold text-white uppercase text-[11px] flex items-center space-x-1.5">
                      <Award className="w-3.5 h-3.5 text-amber-400" />
                      <span>Rincian Hadiah & Trofi Juara</span>
                    </h5>
                    <p className="text-[10px] text-slate-400">Atur nominal uang tunai dan trofi penghargaan per peringkat.</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setCategoryForm(prev => ({
                        ...prev,
                        prizes: [
                          ...prev.prizes,
                          { rank: `Gelar / Juara ${prev.prizes.length + 1}`, prizeMoney: 500000, trophy: 'Piala + Sertifikat' }
                        ]
                      }));
                    }}
                    className="px-3 py-1 rounded-lg bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/30 text-xs font-bold flex items-center space-x-1 cursor-pointer transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Tambah Baris Hadiah</span>
                  </button>
                </div>

                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {categoryForm.prizes.map((prz, idx) => (
                    <div key={idx} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                      <input
                        type="text"
                        placeholder="Nama Juara (mis: Juara 1 / Top Scorer)"
                        value={prz.rank}
                        onChange={e => {
                          const updated = [...categoryForm.prizes];
                          updated[idx].rank = e.target.value;
                          setCategoryForm({ ...categoryForm, prizes: updated });
                        }}
                        className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-semibold sm:w-44"
                      />

                      <div className="flex items-center space-x-1 flex-1">
                        <span className="text-[11px] text-slate-400 font-mono">Rp</span>
                        <input
                          type="number"
                          placeholder="Nominal Hadiah"
                          value={prz.prizeMoney}
                          onChange={e => {
                            const updated = [...categoryForm.prizes];
                            updated[idx].prizeMoney = Number(e.target.value) || 0;
                            setCategoryForm({ ...categoryForm, prizes: updated });
                          }}
                          className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-emerald-400 font-mono font-bold w-full"
                        />
                      </div>

                      <input
                        type="text"
                        placeholder="Trofi / Fasilitas (opsional)"
                        value={prz.trophy || ''}
                        onChange={e => {
                          const updated = [...categoryForm.prizes];
                          updated[idx].trophy = e.target.value;
                          setCategoryForm({ ...categoryForm, prizes: updated });
                        }}
                        className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 sm:w-44"
                      />

                      {categoryForm.prizes.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const updated = categoryForm.prizes.filter((_, i) => i !== idx);
                            setCategoryForm({ ...categoryForm, prizes: updated });
                          }}
                          className="p-1.5 rounded-lg bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-800/50 cursor-pointer self-center"
                          title="Hapus baris hadiah"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* DAFTAR REGULASI & KETENTUAN (DYNAMIC) */}
              <div className="space-y-3 p-4 rounded-2xl bg-slate-950 border border-slate-800">
                <div className="flex items-center justify-between">
                  <div>
                    <h5 className="font-bold text-white uppercase text-[11px]">
                      Poin Regulasi & Ketentuan Kategori
                    </h5>
                    <p className="text-[10px] text-slate-400">Ketentuan khusus yang wajib dipatuhi tim pada kategori ini.</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setCategoryForm(prev => ({
                        ...prev,
                        rules: [...prev.rules, 'Poin ketentuan atau regulasi baru...']
                      }));
                    }}
                    className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center space-x-1 cursor-pointer transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Tambah Aturan</span>
                  </button>
                </div>

                <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                  {categoryForm.rules.map((rule, idx) => (
                    <div key={idx} className="flex items-center space-x-2">
                      <span className="text-[11px] font-mono text-red-400 font-bold">{idx + 1}.</span>
                      <input
                        type="text"
                        value={rule}
                        onChange={e => {
                          const updated = [...categoryForm.rules];
                          updated[idx] = e.target.value;
                          setCategoryForm({ ...categoryForm, rules: updated });
                        }}
                        className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 flex-1"
                      />
                      {categoryForm.rules.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const updated = categoryForm.rules.filter((_, i) => i !== idx);
                            setCategoryForm({ ...categoryForm, rules: updated });
                          }}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-300 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* MODAL FOOTER */}
              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setCategoryModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white font-semibold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-slate-950 font-bold transition flex items-center space-x-2 shadow-lg shadow-red-900/40 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>{editingCategory ? 'Simpan Perubahan Kategori' : 'Tambahkan Kategori'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 9. MODAL: INSPECT & VERIFIKASI BERKAS DOKUMEN LENGKAP */}
      {inspectDocsItem && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 text-white space-y-6 shadow-2xl animate-fadeIn max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center space-x-3">
                <div className="w-11 h-11 rounded-2xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h4 className="text-lg font-black text-white">
                      Verifikasi Berkas: {inspectDocsItem.teamName}
                    </h4>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-950 text-blue-400 border border-blue-800">
                      {inspectDocsItem.category}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    {inspectDocsItem.institution} • Pelatih: {inspectDocsItem.coachName} ({inspectDocsItem.coachPhone})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setInspectDocsItem(null)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Checklist Persyaratan Kategori */}
            {(() => {
              const reqDocs = getRequiredDocsForCategory(inspectDocsItem.category);
              const docs = inspectDocsItem.documents || {};
              const uploadedEntries = Object.entries(docs).filter(([key, doc]) => doc && (doc as UploadedDoc).name && !( !isSuratKeteranganRequired(inspectDocsItem.category) && key === 'suratKeterangan' ));
              const uploadedReqCount = reqDocs.filter(r => Boolean((docs as any)[r.key])).length;
              const isAllComplete = uploadedReqCount >= reqDocs.length;

              return (
                <div className="space-y-4">
                  {/* Status Banner */}
                  <div className={`p-4 rounded-2xl border flex items-center justify-between ${
                    isAllComplete
                      ? 'bg-emerald-950/50 border-emerald-800/60 text-emerald-300'
                      : 'bg-amber-950/50 border-amber-800/60 text-amber-300'
                  }`}>
                    <div className="flex items-center space-x-3">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                        isAllComplete ? 'bg-emerald-900/80 text-emerald-400' : 'bg-amber-900/80 text-amber-400'
                      }`}>
                        {isAllComplete ? <Check className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                      </div>
                      <div>
                        <h5 className="font-bold text-sm">
                          {isAllComplete ? 'Semua Berkas Wajib Lengkap' : `Berkas Belum Lengkap (${uploadedReqCount}/${reqDocs.length})`}
                        </h5>
                        <p className="text-xs opacity-80">
                          {isAllComplete
                            ? 'Tim ini telah mengunggah semua dokumen yang dipersyaratkan untuk kategori ' + inspectDocsItem.category
                            : 'Masih ada dokumen persyaratan wajib yang belum diunggah untuk kategori ' + inspectDocsItem.category}
                        </p>
                      </div>
                    </div>
                    <span className="font-mono text-sm font-bold px-3 py-1 rounded-xl bg-slate-900/80 border border-slate-700">
                      {uploadedReqCount}/{reqDocs.length} Wajib
                    </span>
                  </div>

                  {/* Daftar Berkas Lengkap */}
                  <div className="space-y-3">
                    <h5 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      Detail Dokumen & Lampiran ({uploadedEntries.length} File Terunggah)
                    </h5>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Tampilkan Semua Dokumen Persyaratan Kategori */}
                      {reqDocs.map(req => {
                        const doc = (docs as any)[req.key] as UploadedDoc | undefined;
                        const info = getDocDisplayInfo(req.key, inspectDocsItem.category);

                        return (
                          <div
                            key={req.key}
                            className={`p-3.5 rounded-2xl border space-y-2 transition ${
                              doc
                                ? 'bg-slate-950 border-slate-800'
                                : 'bg-red-950/20 border-red-900/40'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <span className="font-bold text-white text-xs block">{req.label}</span>
                                <span className="text-[10px] text-slate-400">Wajib ({inspectDocsItem.category})</span>
                              </div>
                              {doc ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
                                  ✓ Terunggah
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-950 text-red-400 border border-red-800">
                                  ✕ Belum Ada
                                </span>
                              )}
                            </div>

                            {doc ? (
                              <div>
                                <p className="text-[11px] text-slate-300 font-mono truncate">{doc.name}</p>
                                <p className="text-[10px] text-slate-500">{doc.size || 'Ukuran tidak diketahui'}</p>
                                <div className="flex items-center gap-2 pt-2">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenPdf(doc, info.title, inspectDocsItem.teamName)}
                                    className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center space-x-1.5 transition cursor-pointer shadow-md shadow-blue-950"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                    <span>Buka & Preview Dokumen</span>
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <p className="text-[11px] text-red-400/80 italic">
                                Belum diunggah oleh pendaftar.
                              </p>
                            )}
                          </div>
                        );
                      })}

                      {/* Dokumen Tambahan: Bukti Pembayaran */}
                      {docs.buktiPembayaran && (
                        <div className="p-3.5 rounded-2xl bg-slate-950 border border-emerald-900/50 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span className="font-bold text-white text-xs block">Bukti Transfer Pembayaran</span>
                              <span className="text-[10px] text-emerald-400 font-semibold">Biaya Pendaftaran</span>
                            </div>
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
                              ✓ Terunggah
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-300 font-mono truncate">{docs.buktiPembayaran.name}</p>
                          <p className="text-[10px] text-slate-500">{docs.buktiPembayaran.size || 'PDF/Foto'}</p>
                          <div className="pt-2">
                            <button
                              type="button"
                              onClick={() => handleOpenPdf(docs.buktiPembayaran!, 'Bukti Transfer Pembayaran', inspectDocsItem.teamName)}
                              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center space-x-1.5 transition cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Lihat Bukti Transfer</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Dokumen Tambahan: Logo Tim */}
                      {docs.logoTim && (
                        <div className="p-3.5 rounded-2xl bg-slate-950 border border-purple-900/50 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span className="font-bold text-white text-xs block">Logo Resmi Tim / Klub</span>
                              <span className="text-[10px] text-purple-400 font-semibold">Visual Tim</span>
                            </div>
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-950 text-purple-400 border border-purple-800">
                              ✓ Terunggah
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-300 font-mono truncate">{docs.logoTim.name}</p>
                          <div className="pt-2">
                            <button
                              type="button"
                              onClick={() => handleOpenPdf(docs.logoTim!, 'Logo Resmi Tim', inspectDocsItem.teamName)}
                              className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold flex items-center space-x-1.5 transition cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Lihat Logo</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Modal Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-800">
              <div className="flex items-center space-x-2">
                <a
                  href={`https://wa.me/${inspectDocsItem.coachPhone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Halo Pelatih ${inspectDocsItem.coachName} (${inspectDocsItem.teamName}), panitia turnamen ingin mengonfirmasi berkas pendaftaran Anda.`)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2 rounded-xl bg-emerald-950 text-emerald-400 hover:bg-emerald-900 border border-emerald-800 text-xs font-bold flex items-center space-x-1.5 cursor-pointer"
                >
                  <Phone className="w-3.5 h-3.5" />
                  <span>Hubungi Pelatih WA</span>
                </a>
                <button
                  type="button"
                  onClick={() => {
                    const item = inspectDocsItem;
                    setInspectDocsItem(null);
                    handleOpenEditReg(item);
                  }}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center space-x-1.5 cursor-pointer"
                >
                  <Edit className="w-3.5 h-3.5 text-blue-400" />
                  <span>Kelola / Unggah Berkas</span>
                </button>
              </div>

              <div className="flex items-center space-x-2">
                {inspectDocsItem.status !== 'APPROVED' && (
                  <button
                    type="button"
                    onClick={() => {
                      updateRegistrationStatus(inspectDocsItem.id, 'APPROVED');
                      setInspectDocsItem(null);
                    }}
                    className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center space-x-1.5 cursor-pointer shadow-lg shadow-emerald-950"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Setujui Pendaftaran</span>
                  </button>
                )}
                {inspectDocsItem.status !== 'REJECTED' && (
                  <button
                    type="button"
                    onClick={() => {
                      const reason = window.prompt('Masukkan alasan penolakan berkas:');
                      if (reason !== null) {
                        updateRegistrationStatus(inspectDocsItem.id, 'REJECTED', reason);
                        setInspectDocsItem(null);
                      }
                    }}
                    className="px-4 py-2 rounded-xl bg-rose-950 text-rose-300 hover:bg-rose-900 border border-rose-800 text-xs font-bold flex items-center space-x-1.5 cursor-pointer"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Tolak Berkas</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setInspectDocsItem(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
