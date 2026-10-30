import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import { useTournament } from '../context/TournamentContext';
import { isSuratKeteranganRequired } from '../shared/registrationRules';
import { compressLogo } from '../utils/imageCompressor';
import { uploadFileToBlob } from '../utils/blobUpload';
import { getRegistrationStatus } from '../utils/registrationStatus';
import {
  RegistrationDocuments,
  TournamentCategory,
  UploadedDoc,
} from '../types';
import {
  FileText,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Download,
  Phone,
  Copy,
  Check,
  ExternalLink,
  Shield,
  X,
  FileCheck,
  Building,
  UserCheck,
  Mail,
  Lock,
  MessageCircle,
  Info,
  PlusCircle,
  RefreshCw
} from 'lucide-react';

interface RegistrationFormProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedCategory?: TournamentCategory;
}

export const RegistrationForm: React.FC<RegistrationFormProps> = ({
  isOpen,
  onClose,
  preselectedCategory = 'SMA',
}) => {
  const { config, categories, registrations, submitNewRegistration, getWhatsAppNotificationUrl, committeeContacts, refreshCategoryQuotas, refreshConfig } = useTournament();
  const regStatus = getRegistrationStatus(config);

  // Helper to calculate real-time registered count for a category
  const getCategoryCount = (catId: TournamentCategory) => {
    const catObj = categories.find(c => c.id === catId);
    const backendCount = catObj?.registeredTeamsCount || 0;
    const clientCount = registrations.filter(r => 
      (r.category === catId || (catObj && r.category === catObj.name) || (catObj && r.category?.toUpperCase() === catId.toUpperCase())) &&
      ['PENDING_PAYMENT', 'PENDING', 'APPROVED', 'REJECTED'].includes(r.status)
    ).length;
    return Math.max(backendCount, clientCount);
  };

  // Helper to determine if a category's quota is full
  const isCategoryFull = (catId: TournamentCategory) => {
    const catObj = categories.find(c => c.id === catId);
    if (!catObj) return false;
    const count = getCategoryCount(catId);
    return count >= catObj.maxTeams;
  };

  // Filter available categories (strictly excluding categories whose quota is full)
  const availableCategories = categories.filter(c => !isCategoryFull(c.id));
  const fullCategories = categories.filter(c => isCategoryFull(c.id));

  // Determine primary committee contact for WhatsApp fallback
  const primaryContact = committeeContacts?.find(c => c.isPrimary) || committeeContacts?.[0] || {
    name: 'Sekretariat Panitia WABUPCUP',
    phone: config.adminContactPhone || '081234567890',
  };
  const cleanPhone = primaryContact.phone.replace(/\D/g, '');
  const formattedWa = cleanPhone.startsWith('0') ? `62${cleanPhone.slice(1)}` : cleanPhone;

  const [category, setCategory] = useState<TournamentCategory>(() => {
    if (categories.some(c => c.id === preselectedCategory && !isCategoryFull(c.id))) {
      return preselectedCategory;
    }
    return availableCategories[0]?.id || 'SMA';
  });

  // Track previous isOpen state to only trigger preselected initialization on modal OPEN
  const prevIsOpenRef = useRef(false);

  // Sync category selection only on modal opening or if current category becomes completely full
  useEffect(() => {
    if (isOpen) {
      if (!prevIsOpenRef.current) {
        // Modal just transitioned from closed to open: apply preselectedCategory if valid and available
        if (preselectedCategory && availableCategories.some(c => c.id === preselectedCategory)) {
          setCategory(preselectedCategory);
        } else if (availableCategories.length > 0 && !availableCategories.some(c => c.id === category)) {
          setCategory(availableCategories[0].id);
        }
      } else {
        // Modal was already open: NEVER overwrite user's selected category on background quota refresh.
        // Only adapt if the currently selected category is no longer available.
        if (availableCategories.length > 0 && !availableCategories.some(c => c.id === category)) {
          setCategory(availableCategories[0].id);
        }
      }
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, preselectedCategory, availableCategories, category]);

  const [teamName, setTeamName] = useState('');
  const [coachName, setCoachName] = useState('');
  const [coachPhone, setCoachPhone] = useState('');
  const [coachEmail, setCoachEmail] = useState('');
  const [playerCount, setPlayerCount] = useState<number>(12);
  const [officialCount, setOfficialCount] = useState<number>(2);
  const [teamLogo, setTeamLogo] = useState<string>('');

  // Uploaded documents state
  const [docs, setDocs] = useState<RegistrationDocuments>({});
  const [uploadErrors, setUploadErrors] = useState<{ [key: string]: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [submittedItem, setSubmittedItem] = useState<any | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [quotaError, setQuotaError] = useState<string | null>(null);
  const [isClosedForced, setIsClosedForced] = useState(false);
  const [activeStep, setActiveStep] = useState<1 | 2>(1);
  const lastFormQuotaFetchRef = useRef<number>(0);

  // Stable registration ID generated for this form session so all uploaded files are linked directly to ref_id in TiDB Cloud
  const generateNewFormId = () => `reg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  const formRegIdRef = useRef<string>(generateNewFormId());

  // Fully reset form state for fresh registration of subsequent teams
  const resetForm = () => {
    formRegIdRef.current = generateNewFormId();
    setActiveStep(1);
    setTeamName('');
    setCoachName('');
    setCoachPhone('');
    setCoachEmail('');
    setPlayerCount(12);
    setOfficialCount(2);
    setTeamLogo('');
    setDocs({});
    setUploadErrors({});
    setSubmittedItem(null);
    setCopiedCode(false);
    setQuotaError(null);
    setIsClosedForced(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  // Ensure modal state clears cleanly whenever closed
  useEffect(() => {
    if (!isOpen) {
      resetForm();
    }
  }, [isOpen]);

  // (i) Refresh quota when form opens (isOpen becomes true)
  useEffect(() => {
    if (isOpen) {
      refreshCategoryQuotas(true).then((fresh) => {
        lastFormQuotaFetchRef.current = Date.now();
        if (fresh) {
          const cur = fresh.find(f => f.id === category);
          if (cur && cur.registeredTeamsCount >= cur.maxTeams) {
            setQuotaError(`Mohon maaf, kuota pendaftaran untuk kategori ${category} saat ini telah penuh!`);
          }
        }
      }).catch(() => {});
    }
  }, [isOpen]);

  // (ii) Refresh quota when tab becomes active again if data > 60s
  useEffect(() => {
    if (!isOpen) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const elapsed = Date.now() - lastFormQuotaFetchRef.current;
        if (elapsed > 60000) {
          refreshCategoryQuotas(true).then((fresh) => {
            lastFormQuotaFetchRef.current = Date.now();
            if (fresh) {
              const cur = fresh.find(f => f.id === category);
              if (cur && cur.registeredTeamsCount >= cur.maxTeams) {
                setQuotaError(`Mohon maaf, kuota pendaftaran untuk kategori ${category} saat ini telah penuh!`);
              }
            }
          }).catch(() => {});
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isOpen, category, refreshCategoryQuotas]);

  if (!isOpen) return null;

  const currentCatDetail = categories.find(c => c.id === category);

  // File validator for max 1MB (1024KB) PDF with Base64 encoding
  const handleFileUpload = async (
    docKey: keyof RegistrationDocuments,
    file: File | null
  ) => {
    if (!file) return;

    // Check fresh quota with force before uploading document
    try {
      const fresh = await refreshCategoryQuotas(true);
      if (fresh) {
        lastFormQuotaFetchRef.current = Date.now();
        const cur = fresh.find(f => f.id === category);
        if (cur && cur.registeredTeamsCount >= cur.maxTeams) {
          setQuotaError(`Mohon maaf, kuota pendaftaran untuk kategori ${category} saat ini telah penuh!`);
          return;
        }
      } else if (isCategoryFull(category)) {
        setQuotaError(`Mohon maaf, kuota pendaftaran untuk kategori ${category} saat ini telah penuh!`);
        return;
      }
    } catch (err) {
      console.warn('Gagal memverifikasi kuota sebelum upload:', err);
      if (isCategoryFull(category)) {
        setQuotaError(`Mohon maaf, kuota pendaftaran untuk kategori ${category} saat ini telah penuh!`);
        return;
      }
    }

    // Validate type (must be PDF)
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setUploadErrors(prev => ({
        ...prev,
        [docKey]: 'Format file wajib .PDF!',
      }));
      return;
    }

    // Validate size (max 1MB = 1024 * 1024 bytes)
    const maxSize = 1024 * 1024;
    if (file.size > maxSize) {
      setUploadErrors(prev => ({
        ...prev,
        [docKey]: `Ukuran file melebihi batas 1MB / 1024 KB (File Anda: ${(file.size / 1024).toFixed(0)} KB)!`,
      }));
      return;
    }

    // Clear error
    setUploadErrors(prev => {
      const copy = { ...prev };
      delete copy[docKey];
      return copy;
    });

    const sizeStr = file.size >= 1024 * 1024 
      ? (file.size / (1024 * 1024)).toFixed(2) + ' MB' 
      : (file.size / 1024).toFixed(0) + ' KB';
    const now = new Date().toISOString().split('T')[0];

    uploadFileToBlob(file, 'registrations', undefined, formRegIdRef.current, docKey as string)
      .then((uploaded) => {
        const uploadedDoc: UploadedDoc = {
          name: uploaded.name,
          size: uploaded.size || sizeStr,
          uploadDate: now,
          type: uploaded.type || 'application/pdf',
          url: uploaded.url,
          fileData: uploaded.fileData || uploaded.url,
        };

        setDocs(prev => ({
          ...prev,
          [docKey]: uploadedDoc,
        }));
      })
      .catch((err) => {
        if (err?.code === 'REGISTRATION_CLOSED' || err?.status === 403) {
          setIsClosedForced(true);
          refreshConfig?.();
          refreshCategoryQuotas(true).catch(() => {});
          return;
        }
        console.error('Upload to blob failed, falling back to local reader:', err);
        const reader = new FileReader();
        reader.onload = () => {
          const base64Data = reader.result as string;
          const uploadedDoc: UploadedDoc = {
            name: file.name,
            size: sizeStr,
            uploadDate: now,
            type: 'application/pdf',
            fileData: base64Data,
          };

          setDocs(prev => ({
            ...prev,
            [docKey]: uploadedDoc,
          }));
        };
        reader.readAsDataURL(file);
      });
  };

  // Logo uploader (PNG, JPG, SVG, WebP) - automatically compressed or uploaded to cloud
  const handleLogoUpload = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Format logo tim harus berupa gambar (PNG, JPG, SVG, atau WEBP)!');
      return;
    }
    
    uploadFileToBlob(file, 'logos', undefined, formRegIdRef.current, 'teamLogo')
      .then((uploaded) => {
        setTeamLogo(uploaded.url);
        setDocs(prev => ({
          ...prev,
          logoTim: {
            name: uploaded.name,
            size: uploaded.size,
            uploadDate: new Date().toISOString().split('T')[0],
            type: uploaded.type,
            url: uploaded.url,
            fileData: uploaded.fileData || uploaded.url,
          },
        }));
      })
      .catch((err) => {
        if (err?.code === 'REGISTRATION_CLOSED' || err?.status === 403) {
          setIsClosedForced(true);
          refreshConfig?.();
          refreshCategoryQuotas(true).catch(() => {});
          return;
        }
        // Fallback to local canvas compression if direct upload is unavailable
        compressLogo(file, 400, 0.85)
          .then((compressedBase64) => {
            setTeamLogo(compressedBase64);
            const approxSizeKb = (compressedBase64.length * 0.75 / 1024).toFixed(1);
            setDocs(prev => ({
              ...prev,
              logoTim: {
                name: file.name,
                size: `${approxSizeKb} KB`,
                uploadDate: new Date().toISOString().split('T')[0],
                type: 'image/jpeg',
                fileData: compressedBase64,
              },
            }));
          })
          .catch(() => {
            const reader = new FileReader();
            reader.onload = () => {
              const base64 = reader.result as string;
              setTeamLogo(base64);
              setDocs(prev => ({
                ...prev,
                logoTim: {
                  name: file.name,
                  size: `${(file.size / 1024).toFixed(1)} KB`,
                  uploadDate: new Date().toISOString().split('T')[0],
                  type: file.type,
                  fileData: base64,
                },
              }));
            };
            reader.readAsDataURL(file);
          });
      });
  };

  const handleNextStep = () => {
    if (!teamName.trim()) {
      alert('Mohon isi nama tim terlebih dahulu.');
      return;
    }
    if (!teamLogo) {
      alert('Mohon unggah Logo Tim / Klub resmi terlebih dahulu! (Wajib)');
      return;
    }
    if (!coachName.trim()) {
      alert('Mohon isi nama pelatih / pembina / official terlebih dahulu.');
      return;
    }
    if (!coachPhone.trim()) {
      alert('Mohon isi nomor WhatsApp aktif pelatih / official.');
      return;
    }
    setActiveStep(2);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Prevent double submission
    if (submittingRef.current || isSubmitting) {
      return;
    }

    // Force refresh quota right before submit
    try {
      const fresh = await refreshCategoryQuotas(true);
      if (fresh) {
        lastFormQuotaFetchRef.current = Date.now();
        const cur = fresh.find(f => f.id === category);
        if (cur && cur.registeredTeamsCount >= cur.maxTeams) {
          setQuotaError(`Mohon maaf, kuota pendaftaran untuk kategori ${category} saat ini telah penuh!`);
          return;
        }
      } else if (isCategoryFull(category)) {
        setQuotaError(`Mohon maaf, kuota pendaftaran untuk kategori ${category} saat ini telah penuh!`);
        return;
      }
    } catch (err) {
      console.warn('Gagal memverifikasi kuota sebelum submit:', err);
      if (isCategoryFull(category)) {
        setQuotaError(`Mohon maaf, kuota pendaftaran untuk kategori ${category} saat ini telah penuh!`);
        return;
      }
    }

    // Validate required documents and logo
    const isSchool = category === 'SD' || category === 'SMP' || category === 'SMA';
    const isInstansi = category === 'INSTANSI';
    const isDesa = category === 'DESA';
    const isUmum = category === 'UMUM';

    if (!teamLogo) {
      alert('Mohon unggah Logo Tim / Klub resmi! (Wajib)');
      return;
    }
    if (isSuratKeteranganRequired(category) && !docs.suratKeterangan) {
      const keteranganLabel = isSchool
        ? 'Surat Keterangan / Izin Sekolah (PDF)'
        : isInstansi
        ? 'Surat Tugas / Keterangan Instansi (PDF)'
        : 'Surat Keterangan Kepala Desa / Lurah (PDF)';
      alert(`Mohon lampirkan ${keteranganLabel}! (Wajib)`);
      return;
    }
    if (!docs.suratPernyataan) {
      alert('Mohon lampirkan Surat Pernyataan Bermaterai (PDF)! (Wajib)');
      return;
    }
    if (!docs.formulirPemain) {
      alert('Mohon lampirkan Formulir Susunan Pemain & Official (PDF)! (Wajib)');
      return;
    }
    if (category === 'SD' && !docs.aktaKelahiran) {
      alert('Khusus Kategori SD, wajib melampirkan file gabungan Akta Kelahiran (Kelahiran Maksimal 2014)! (Wajib)');
      return;
    }
    if (isSchool && !docs.raportKartuPelajar) {
      alert(`Khusus Kategori ${category}, wajib melampirkan Raport Terakhir / Kartu Pelajar yang digabung dalam 1 file PDF! (Wajib)`);
      return;
    }
    if ((isDesa || isUmum) && !docs.ktpGabungan) {
      alert(`Khusus Kategori ${category === 'DESA' ? 'Desa / Kelurahan' : 'Umum'}, wajib melampirkan File KTP Pemain & Official yang digabung menjadi 1 PDF! (Wajib)`);
      return;
    }
    if (isInstansi && !docs.bpjsKetenagakerjaan) {
      alert('Khusus Kategori Instansi / OPD / BUMN / Perbankan, wajib melampirkan File BPJS Ketenagakerjaan yang digabung menjadi 1 PDF! (Wajib)');
      return;
    }

    submittingRef.current = true;
    setIsSubmitting(true);

    try {
      const regFee = currentCatDetail?.registrationFee || 350000;
      const cleanTeamName = teamName.trim();

      const newRegistration = await submitNewRegistration({
        id: formRegIdRef.current,
        category,
        teamName: cleanTeamName,
        teamLogo: teamLogo || undefined,
        institutionName: cleanTeamName,
        coachName: coachName.trim(),
        coachPhone: coachPhone.trim(),
        coachEmail: coachEmail.trim(),
        playerCount,
        officialCount,
        paymentAmount: regFee,
        documents: docs,
      } as any);

      // Launch celebratory confetti
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
        });
      } catch (err) {}

      setSubmittedItem(newRegistration);
    } catch (err: any) {
      console.error('Registration submission error:', err);
      if (err?.code === 'REGISTRATION_CLOSED' || err?.status === 403) {
        setIsClosedForced(true);
        refreshConfig?.();
        refreshCategoryQuotas(true).catch(() => {});
        return;
      }
      const errMsg = err?.message || '';
      if (errMsg.toLowerCase().includes('kuota') || errMsg.toLowerCase().includes('penuh') || errMsg.toLowerCase().includes('ditolak')) {
        setQuotaError(errMsg);
        setTimeout(() => window.location.reload(), 7000);
      } else {
        alert(errMsg || 'Terjadi kesalahan saat memproses pendaftaran. Silakan coba lagi.');
      }
    } finally {
      setIsSubmitting(false);
      submittingRef.current = false;
    }
  };

  const handleCopyCode = () => {
    if (submittedItem) {
      navigator.clipboard.writeText(submittedItem.regCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2500);
    }
  };

  return (
    <div
      id="registration-modal-overlay"
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-fadeIn"
    >
      <motion.div
        id="registration-modal-container"
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', damping: 26, stiffness: 300 }}
        className="relative w-full max-w-3xl rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden my-6 text-slate-900 dark:text-white"
      >
        
        {/* MODAL TOP HEADER */}
        <div className="px-6 py-5 bg-gradient-to-r from-red-600 to-blue-900 text-white flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center text-xl">
              ⚽
            </div>
            <div>
              <h3 className="text-xl font-heading font-bold uppercase tracking-wider leading-none">
                FORMULIR PENDAFTARAN TIM WABUPCUP 2026
              </h3>
              <p className="text-xs text-white/80 mt-1">
                Lengkapi biodata dan unggah berkas persyaratan PDF resmi (Maks. 1MB / 1024 KB)
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-lg bg-black/20 hover:bg-black/40 text-white flex items-center justify-center transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* REGISTRATION CUSTOM LINK OR CLOSED/HIDDEN VIEW */}
        {regStatus.isCustomLink ? (
          <div className="p-8 sm:p-12 space-y-6 animate-fadeIn text-center">
            <div className="w-20 h-20 rounded-full bg-cyan-100 dark:bg-cyan-950/80 text-cyan-600 dark:text-cyan-400 mx-auto flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <ExternalLink className="w-10 h-10" />
            </div>

            <div>
              <span className="text-sm font-bold uppercase tracking-widest text-cyan-600 dark:text-cyan-400 block mb-1">
                INFORMASI PENDAFTARAN
              </span>
              <h4 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white leading-tight">
                Pendaftaran Dialihkan ke Tautan Resmi
              </h4>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-lg mx-auto mt-3 border border-cyan-200 dark:border-cyan-900/50 bg-cyan-50 dark:bg-cyan-900/10 p-4 rounded-xl leading-relaxed">
                Panitia pelaksana mengarahkan pendaftaran turnamen melalui tautan pendaftaran eksternal resmi. Silakan klik tombol di bawah untuk melanjutkan pendaftaran.
              </p>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
              <a
                href={regStatus.customLink}
                target={regStatus.openInNewTab ? "_blank" : "_self"}
                rel="noopener noreferrer"
                className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs uppercase tracking-wider transition shadow-lg shadow-cyan-600/30 flex items-center justify-center space-x-2 cursor-pointer"
              >
                <span>{regStatus.customButtonText || 'Buka Formulir Pendaftaran'}</span>
                <ExternalLink className="w-4 h-4" />
              </a>
              <button
                type="button"
                onClick={handleClose}
                className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs uppercase tracking-wider transition shadow-lg cursor-pointer"
              >
                Tutup Formulir
              </button>
            </div>
          </div>
        ) : (!regStatus.isVisible || isClosedForced) ? (
          <div className="p-8 sm:p-12 space-y-6 animate-fadeIn text-center">
            <div className="w-20 h-20 rounded-full bg-amber-100 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 mx-auto flex items-center justify-center shadow-lg shadow-amber-500/20">
              <Lock className="w-10 h-10" />
            </div>

            <div>
              <span className="text-sm font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400 block mb-1">
                INFORMASI PENDAFTARAN
              </span>
              <h4 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white leading-tight">
                Pendaftaran Belum Dibuka / Sedang Ditutup
              </h4>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-lg mx-auto mt-3 border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-900/10 p-4 rounded-xl leading-relaxed">
                Panitia pelaksana saat ini belum membuka formulir pendaftaran tim atau seluruh kuota pendaftaran telah terpenuhi. Pantau informasi resmi atau hubungi narahubung panitia turnamen.
              </p>
            </div>

            <div className="pt-2 flex items-center justify-center space-x-3">
              <button
                type="button"
                onClick={handleClose}
                className="w-full sm:w-auto px-6 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs uppercase tracking-wider transition shadow-lg cursor-pointer"
              >
                Tutup Formulir
              </button>
            </div>
          </div>
        ) : quotaError ? (
          <div className="p-8 sm:p-12 space-y-6 animate-fadeIn text-center">
            <div className="w-20 h-20 rounded-full bg-red-100 dark:bg-red-950/80 text-red-600 dark:text-red-400 mx-auto flex items-center justify-center shadow-lg shadow-red-500/20">
              <AlertCircle className="w-10 h-10" />
            </div>

            <div>
              <span className="text-sm font-bold uppercase tracking-widest text-red-600 dark:text-red-400 block mb-1">
                PENDAFTARAN DITOLAK
              </span>
              <h4 className="text-3xl font-bold text-slate-900 dark:text-white leading-tight">
                Kuota Terisi Penuh
              </h4>
              <p className="text-sm text-slate-600 dark:text-slate-400 max-w-lg mx-auto mt-3 border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/10 p-4 rounded-xl">
                {quotaError}
              </p>
            </div>
            
            <div className="pt-4 flex items-center justify-center space-x-3">
              <button
                onClick={() => window.location.reload()}
                className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm transition shadow-xl shadow-slate-900/30 flex items-center justify-center space-x-2 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Kembali ke Beranda & Refresh</span>
              </button>
            </div>
          </div>
        ) : submittedItem ? (
          <div className="p-6 sm:p-8 space-y-6 animate-fadeIn text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center text-3xl shadow-lg shadow-emerald-500/20">
              ✓
            </div>

            <div>
              <span className="text-xs font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400 block mb-1">
                Pendaftaran Berhasil Dikirimkan!
              </span>
              <h4 className="text-2xl font-bold text-slate-900 dark:text-white">
                Selamat Datang, Tim {submittedItem.teamName}!
              </h4>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-lg mx-auto mt-1">
                Data pendaftaran dan berkas dokumen Anda telah terkirim ke Admin.
              </p>
            </div>

            {/* REGISTRATION CODE & PAYMENT INSTRUCTIONS */}
            <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 text-left space-y-4 max-w-xl mx-auto">
              
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Kode Registrasi Tim</span>
                  <span className="text-xl font-mono font-bold text-red-600 dark:text-red-400">
                    {submittedItem.regCode}
                  </span>
                </div>
                <button
                  onClick={handleCopyCode}
                  className="px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-xs font-semibold flex items-center space-x-1.5 transition"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{copiedCode ? 'Tersalin!' : 'Salin Kode'}</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-500 block">Kategori</span>
                  <strong className="text-slate-800 dark:text-slate-200">{submittedItem.category}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block">Biaya Registrasi</span>
                  <strong className="text-emerald-600 dark:text-emerald-400">
                    Rp {submittedItem.paymentAmount.toLocaleString('id-ID')}
                  </strong>
                </div>
              </div>

              {/* VALIDATION & PAYMENT FLOW NOTICE (NO BANK NUMBER DISPLAYED) */}
              <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 text-xs space-y-3">
                <div className="flex items-start space-x-2.5">
                  <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                    <Shield className="w-4 h-4" />
                  </div>
                  <div>
                    <h5 className="font-bold text-amber-950 dark:text-amber-200 text-sm">
                      Wajib Hubungi Admin Panitia Terlebih Dahulu
                    </h5>
                    <p className="text-amber-900/90 dark:text-amber-300 mt-1 leading-relaxed">
                      Nomor rekening pembayaran <strong>tidak ditampilkan langsung</strong> demi menjaga ketertiban administrasi. Pendaftar wajib menghubungi admin panitia untuk proses validasi berkas persyaratan sebelum melakukan transfer.
                    </p>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-white/80 dark:bg-slate-950/70 border border-amber-200/70 dark:border-amber-900/50 space-y-2 text-slate-700 dark:text-slate-300">
                  <span className="font-bold text-[11px] text-slate-900 dark:text-white uppercase tracking-wider block">
                    Tahapan Selanjutnya:
                  </span>
                  <ul className="space-y-1.5 text-[11px]">
                    <li className="flex items-start space-x-2">
                      <span className="w-4 h-4 rounded-full bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">1</span>
                      <span>Klik tombol WhatsApp di bawah untuk konfirmasi ke Admin Panitia dengan membawa <strong>Kode Registrasi: {submittedItem.regCode}</strong>.</span>
                    </li>
                    <li className="flex items-start space-x-2">
                      <span className="w-4 h-4 rounded-full bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">2</span>
                      <span>Admin akan melakukan <strong>validasi kelengkapan dokumen</strong> (formulir, foto pemain, dan surat pernyataan).</span>
                    </li>
                    <li className="flex items-start space-x-2">
                      <span className="w-4 h-4 rounded-full bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">3</span>
                      <span>Setelah berkas disetujui, admin akan memberikan instruksi pembayaran dan <strong>nomor rekening resmi panitia</strong> untuk penguncian slot tim.</span>
                    </li>
                  </ul>
                </div>
              </div>

            </div>

            {/* ACTION BUTTON: DIRECT TO WHATSAPP ADMIN & REGISTER ANOTHER TEAM */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <a
                id="btn-whatsapp-confirmation"
                href={`https://wa.me/${formattedWa}?text=${encodeURIComponent(
                  `Halo Panitia *${config.name + '2026' || 'WABUPCUP 2026'}*, saya *${submittedItem.coachName}* dari tim *${submittedItem.teamName}* (Kategori: *${submittedItem.category}*).\n\nSaya telah berhasil mendaftarkan tim secara online dengan rincian:\n📌 *Kode Registrasi:* ${submittedItem.regCode}\n⚽ *Nama Tim:* ${submittedItem.teamName}\n🏷️ *Kategori:* ${submittedItem.category}\n💰 *Biaya Pendaftaran:* Rp ${submittedItem.paymentAmount.toLocaleString('id-ID')}\n\nSaya ingin melakukan *validasi berkas persyaratan dokumen* dan *konfirmasi pembayaran resmi*. Mohon arahannya panitia, terima kasih!`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto px-7 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-600/30 transition flex items-center justify-center space-x-2"
              >
                <Phone className="w-4 h-4" />
                <span>Hubungi Admin</span>
                <ExternalLink className="w-4 h-4" />
              </a>

              <button
                type="button"
                id="btn-register-another-team"
                onClick={resetForm}
                className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm shadow-md transition flex items-center justify-center space-x-2 cursor-pointer"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Daftar Tim Lainnya</span>
              </button>

              <button
                type="button"
                onClick={handleClose}
                className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold text-sm transition cursor-pointer"
              >
                Selesai & Tutup
              </button>
            </div>
          </div>
        ) : availableCategories.length === 0 ? (
          
          /* ALL CATEGORIES ARE FULL VIEW */
          <div className="p-8 sm:p-10 space-y-6 text-center animate-fadeIn">
            <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 mx-auto flex items-center justify-center text-2xl shadow-lg shadow-amber-500/20">
              <Lock className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-widest text-red-600 dark:text-red-400">
                Pemberitahuan Pendaftaran
              </span>
              <h4 className="text-2xl font-bold text-slate-900 dark:text-white">
                Kuota Seluruh Kategori Telah Penuh!
              </h4>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-lg mx-auto">
                Terima kasih atas antusiasme luar biasa Anda. Seluruh slot kuota pendaftaran tim untuk semua kategori turnamen WABUPCUP 2026 telah terisi 100%.
              </p>
            </div>

            {/* FULL CATEGORIES STATUS LIST */}
            <div className="bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 text-left max-w-lg mx-auto space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                Status Kuota Kategori:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {categories.map(c => {
                  const regCount = getCategoryCount(c.id);
                  return (
                    <div key={c.id} className="p-2.5 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                      <span className="font-bold text-slate-800 dark:text-slate-200">{c.name}</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-600 dark:text-red-400">
                        {regCount}/{c.maxTeams} Penuh
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ACTION BUTTONS */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <a
                href={`https://wa.me/${formattedWa}?text=${encodeURIComponent(`Halo Panitia WABUPCUP 2026, saya ingin menanyakan perihal waiting list / kuota tambahan untuk pendaftaran turnamen.`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-emerald-600/30 transition flex items-center justify-center space-x-2"
              >
                <MessageCircle className="w-4 h-4" />
                <span>Hubungi Panitia (Waiting List)</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>

              <button
                onClick={onClose}
                className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold text-xs transition"
              >
                Tutup Jendela
              </button>
            </div>
          </div>
        ) : categories.length === 0 ? (
          /* SKELETON LOADING STATE WHEN CATEGORIES ARE STILL LOADING FROM DATABASE */
          <div className="p-8 sm:p-12 text-center space-y-6">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 flex items-center justify-center">
              <span className="relative flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-4 w-4 bg-red-600"></span>
              </span>
            </div>
            <div className="space-y-2 max-w-md mx-auto">
              <h4 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                Menyinkronkan Kategori & Nominal Resmi...
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Sistem sedang memuat data kategori dan nominal biaya pendaftaran resmi dari database panitia agar bebas dari data dummy.
              </p>
            </div>
            <div className="space-y-3 max-w-sm mx-auto pt-2 animate-pulse">
              <div className="h-10 bg-slate-200 dark:bg-slate-800 rounded-xl" />
              <div className="h-10 bg-slate-200 dark:bg-slate-800 rounded-xl" />
            </div>
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold transition cursor-pointer"
            >
              Tutup Formulir
            </button>
          </div>
        ) : (
          
          /* MAIN FORM WITH MULTI-STEP NAVIGATION */
          <form onSubmit={handleSubmit} className="flex flex-col max-h-[82vh] overflow-hidden">
            {/* STEP TABS INDICATOR */}
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-900/70 px-6 py-2.5 shrink-0">
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setActiveStep(1)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer ${
                    activeStep === 1
                      ? 'bg-red-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Building className="w-3.5 h-3.5" />
                  <span>1. Identitas & Kontak Tim</span>
                </button>
                <span className="text-slate-300 dark:text-slate-700">→</span>
                <button
                  type="button"
                  onClick={() => {
                    if (!teamName.trim()) {
                      alert('Mohon isi nama tim terlebih dahulu sebelum beralih ke upload berkas.');
                      return;
                    }
                    setActiveStep(2);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer ${
                    activeStep === 2
                      ? 'bg-red-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>2. Upload Berkas PDF</span>
                  {Object.keys(docs).length > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold">
                      {Object.keys(docs).length} Diunggah
                    </span>
                  )}
                </button>
              </div>
              <span className="text-[11px] font-medium text-slate-500 hidden sm:inline">
                Langkah {activeStep} dari 2
              </span>
            </div>

            <div className="p-6 sm:p-8 space-y-6 overflow-y-auto flex-1">
              <AnimatePresence mode="wait">
                {activeStep === 1 ? (
                  <motion.div
                    key="step-1"
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -16 }}
                    transition={{ duration: 0.25 }}
                    className="space-y-6"
                  >
                    {/* SECTION 1: KATEGORI & INFORMASI TIM */}
                    <div className="space-y-4">
                      <div className="flex items-center space-x-2 text-sm font-bold uppercase tracking-wider text-red-600 dark:text-red-400 border-b border-slate-200 dark:border-slate-800 pb-2">
                        <Building className="w-4 h-4" />
                        <span>1. Data Kategori & Identitas Tim</span>
                      </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Kategori Turnamen <span className="text-red-500">*</span>
                    </label>
                    {currentCatDetail && (
                      <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                        Sisa {Math.max(0, currentCatDetail.maxTeams - getCategoryCount(currentCatDetail.id))} Slot ({getCategoryCount(currentCatDetail.id)}/{currentCatDetail.maxTeams} Terdaftar)
                      </span>
                    )}
                  </div>
                  <select
                    id="reg-input-category"
                    value={category}
                    onChange={e => {
                      setCategory(e.target.value as TournamentCategory);
                      setQuotaError(null);
                    }}
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-medium focus:ring-2 focus:ring-red-500 focus:outline-none"
                  >
                    {availableCategories.map(c => {
                      const count = getCategoryCount(c.id);
                      const sisa = Math.max(0, c.maxTeams - count);
                      return (
                        <option key={c.id} value={c.id}>
                          {c.name} — Biaya: Rp {c.registrationFee.toLocaleString('id-ID')} (Sisa {sisa} Slot - {count}/{c.maxTeams} Tim)
                        </option>
                      );
                    })}
                  </select>
                  {fullCategories.length > 0 && (
                    <p className="text-[10px] text-slate-400 mt-1 flex items-center space-x-1">
                      <Info className="w-3 h-3 text-amber-500 shrink-0" />
                      <span>
                        Kategori penuh ({fullCategories.map(f => f.id).join(', ')}) otomatis tidak ditampilkan.
                      </span>
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Nama Team / Sekolah / Instansi / Desa <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: SMAN 1 Garudakusuma FC / Dispora FC / Desa Sukamaju"
                    value={teamName}
                    onChange={e => setTeamName(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm focus:ring-2 focus:ring-red-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Jumlah Pemain (Maksimal 12 Orang) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min={7}
                    max={12}
                    required
                    value={playerCount}
                    onChange={e => setPlayerCount(Number(e.target.value))}
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm focus:ring-2 focus:ring-red-500 focus:outline-none"
                  />
                  <span className="text-[11px] text-slate-400 mt-1 block">Minimal 7 pemain, maksimal 12 pemain.</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Jumlah Official / Pelatih (Maksimal 3 Orang) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={3}
                    required
                    value={officialCount}
                    onChange={e => setOfficialCount(Math.min(3, Math.max(1, Number(e.target.value))))}
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm focus:ring-2 focus:ring-red-500 focus:outline-none"
                  />
                  <span className="text-[11px] text-slate-400 mt-1 block">Minimal 1 official, maksimal 3 official.</span>
                </div>
              </div>

              {/* UPLOAD LOGO TIM (WAJIB) */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
                    {teamLogo ? (
                      <img loading="lazy"
                        src={teamLogo}
                        alt="Preview Logo Tim"
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <span className="text-lg">🛡️</span>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                      Upload Logo Tim / Instansi / Klub <span className="text-red-500">* (Wajib)</span>
                    </label>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Format PNG / JPG / SVG / WEBP. Logo wajib diunggah untuk ditampilkan pada bagan turnamen dan live score.
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2 shrink-0">
                  <label className="cursor-pointer px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition flex items-center space-x-1.5">
                    <UploadCloud className="w-3.5 h-3.5" />
                    <span>{teamLogo ? 'Ganti Logo' : 'Pilih Logo *'}</span>
                    <input
                      type="file"
                      accept="image/png, image/jpeg, image/webp, image/svg+xml"
                      className="hidden"
                      onChange={e => handleLogoUpload(e.target.files?.[0] || null)}
                    />
                  </label>
                  {teamLogo && (
                    <button
                      type="button"
                      onClick={() => {
                        setTeamLogo('');
                        setDocs(prev => {
                          const c = { ...prev };
                          delete c.logoTim;
                          return c;
                        });
                      }}
                      className="px-2 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-red-500 text-xs font-semibold transition"
                    >
                      Hapus
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* SECTION 2: KONTAK OFFICIAL / PELATIH */}
            <div className="space-y-4">
              <div className="flex items-center space-x-2 text-sm font-bold uppercase tracking-wider text-red-600 dark:text-red-400 border-b border-slate-200 dark:border-slate-800 pb-2">
                <UserCheck className="w-4 h-4" />
                <span>2. Kontak Pelatih / Pembina / Official</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Nama Pelatih / Pembina <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Bambang Supriyanto, S.Pd"
                    value={coachName}
                    onChange={e => setCoachName(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm focus:ring-2 focus:ring-red-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    No. WhatsApp Aktif <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="081234567890"
                    value={coachPhone}
                    onChange={e => setCoachPhone(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm focus:ring-2 focus:ring-red-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Email Aktif <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="coach@sekolah.sch.id"
                    value={coachEmail}
                    onChange={e => setCoachEmail(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm focus:ring-2 focus:ring-red-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* FOOTER STEP 1 */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <button
                type="button"
                onClick={handleClose}
                className="px-5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 transition cursor-pointer"
              >
                Batal
              </button>

              <button
                type="button"
                onClick={handleNextStep}
                className="px-6 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition flex items-center space-x-2 cursor-pointer shadow-md shadow-red-600/20"
              >
                <span>Lanjut ke Upload Berkas (Langkah 2)</span>
                <span>→</span>
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="step-2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.25 }}
            className="space-y-6"
          >
            {/* SECTION 3: UPLOAD PERSYARATAN DOKUMEN PDF */}
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2 gap-2">
                <div className="flex items-center space-x-2 text-sm font-bold uppercase tracking-wider text-red-600 dark:text-red-400">
                  <FileText className="w-4 h-4" />
                  <span>3. Unggah Berkas Persyaratan PDF (Maks. 1 MB / 1024 KB)</span>
                </div>
                {config.downloadableDocs && config.downloadableDocs.length > 0 ? (
                  <div className="flex items-center flex-wrap gap-2 text-xs">
                    <span className="text-slate-500 text-[11px]">Download Template:</span>
                    {config.downloadableDocs.map(doc => (
                      <a
                        key={doc.id}
                        href={doc.fileUrl ? (doc.fileUrl.includes('?') ? `${doc.fileUrl}&download=1` : `${doc.fileUrl}?download=1`) : '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        download={doc.fileName}
                        className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/60 flex items-center space-x-1 font-semibold text-[11px] transition"
                      >
                        <Download className="w-3 h-3" />
                        <span>{doc.title}</span>
                      </a>
                    ))}
                  </div>
                ) : (
                  <a
                    href={config.formulirTemplateUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center space-x-1 font-semibold"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Formulir Pemain</span>
                  </a>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* 1. SURAT KETERANGAN SEKOLAH / INSTANSI / DESA (Dikecualikan untuk Kategori Terbuka/UMUM) */}
                {category !== 'UMUM' && (
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                      {category === 'SD' || category === 'SMP' || category === 'SMA'
                        ? 'Surat Keterangan / Izin Sekolah (PDF)'
                        : category === 'INSTANSI'
                        ? 'Surat Tugas / Keterangan Instansi (PDF)'
                        : 'Surat Keterangan Kepala Desa/Lurah (PDF)'}
                      {isSuratKeteranganRequired(category) && <span className="text-red-500">*</span>}
                    </label>
                    <input
                      type="file"
                      accept=".pdf,application/pdf"
                      onChange={e => handleFileUpload('suratKeterangan', e.target.files?.[0] || null)}
                      className="w-full text-xs text-slate-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-red-600 file:text-white file:text-xs file:font-semibold hover:file:bg-red-700 cursor-pointer"
                    />
                    {docs.suratKeterangan && (
                      <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium mt-1 flex items-center space-x-1">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>{docs.suratKeterangan.name} ({docs.suratKeterangan.size})</span>
                      </p>
                    )}
                    {uploadErrors.suratKeterangan && (
                      <p className="text-[11px] text-red-500 font-medium mt-1">{uploadErrors.suratKeterangan}</p>
                    )}
                  </div>
                )}

                {/* 2. SURAT PERNYATAAN BERMATERAI */}
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                    Surat Pernyataan Bermaterai (PDF) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="file"
                    accept=".pdf,application/pdf"
                    onChange={e => handleFileUpload('suratPernyataan', e.target.files?.[0] || null)}
                    className="w-full text-xs text-slate-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-red-600 file:text-white file:text-xs file:font-semibold hover:file:bg-red-700 cursor-pointer"
                  />
                  {docs.suratPernyataan && (
                    <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium mt-1 flex items-center space-x-1">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>{docs.suratPernyataan.name} ({docs.suratPernyataan.size})</span>
                    </p>
                  )}
                  {uploadErrors.suratPernyataan && (
                    <p className="text-[11px] text-red-500 font-medium mt-1">{uploadErrors.suratPernyataan}</p>
                  )}
                </div>

                {/* 3. FORMULIR PEMAIN */}
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                    Formulir Susunan Pemain & Official (PDF) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="file"
                    accept=".pdf,application/pdf"
                    onChange={e => handleFileUpload('formulirPemain', e.target.files?.[0] || null)}
                    className="w-full text-xs text-slate-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-red-600 file:text-white file:text-xs file:font-semibold hover:file:bg-red-700 cursor-pointer"
                  />
                  {docs.formulirPemain && (
                    <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium mt-1 flex items-center space-x-1">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>{docs.formulirPemain.name} ({docs.formulirPemain.size})</span>
                    </p>
                  )}
                  {uploadErrors.formulirPemain && (
                    <p className="text-[11px] text-red-500 font-medium mt-1">{uploadErrors.formulirPemain}</p>
                  )}
                </div>

                {/* 4. AKTA KELAHIRAN (KHUSUS KATEGORI SD) */}
                {category === 'SD' && (
                  <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800">
                    <label className="block text-xs font-bold text-red-900 dark:text-red-300 mb-1">
                      Akta Kelahiran Gabungan Maks 2014 (Khusus SD) (PDF) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="file"
                      accept=".pdf,application/pdf"
                      onChange={e => handleFileUpload('aktaKelahiran', e.target.files?.[0] || null)}
                      className="w-full text-xs text-slate-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-red-600 file:text-white file:text-xs file:font-semibold hover:file:bg-red-700 cursor-pointer"
                    />
                    {docs.aktaKelahiran && (
                      <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium mt-1 flex items-center space-x-1">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>{docs.aktaKelahiran.name} ({docs.aktaKelahiran.size})</span>
                      </p>
                    )}
                    {uploadErrors.aktaKelahiran && (
                      <p className="text-[11px] text-red-500 font-medium mt-1">{uploadErrors.aktaKelahiran}</p>
                    )}
                  </div>
                )}

                {/* 5. RAPORT TERAKHIR / KARTU PELAJAR (KHUSUS SD, SMP, SMA) */}
                {(category === 'SD' || category === 'SMP' || category === 'SMA') && (
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                      Raport Terakhir / Kartu Pelajar Digabung 1 PDF <span className="text-red-500">*</span>
                    </label>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-2">
                      Scan Raport terakhir / Kartu Pelajar seluruh pemain disatukan ke dalam 1 file PDF (Maks. 1MB).
                    </p>
                    <input
                      type="file"
                      accept=".pdf,application/pdf"
                      onChange={e => handleFileUpload('raportKartuPelajar', e.target.files?.[0] || null)}
                      className="w-full text-xs text-slate-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-red-600 file:text-white file:text-xs file:font-semibold hover:file:bg-red-700 cursor-pointer"
                    />
                    {docs.raportKartuPelajar && (
                      <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium mt-1 flex items-center space-x-1">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>{docs.raportKartuPelajar.name} ({docs.raportKartuPelajar.size})</span>
                      </p>
                    )}
                    {uploadErrors.raportKartuPelajar && (
                      <p className="text-[11px] text-red-500 font-medium mt-1">{uploadErrors.raportKartuPelajar}</p>
                    )}
                  </div>
                )}

                {/* 6. KTP PEMAIN & OFFICIAL DIGABUNG 1 PDF (KHUSUS DESA/KELURAHAN & UMUM) */}
                {(category === 'DESA' || category === 'UMUM') && (
                  <div className="p-4 rounded-xl bg-amber-50/60 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800">
                    <label className="block text-xs font-bold text-amber-950 dark:text-amber-300 mb-1">
                      File KTP Pemain & Official Digabung 1 PDF <span className="text-red-500">*</span>
                    </label>
                    <p className="text-[10px] text-slate-600 dark:text-slate-400 mb-2">
                      Scan / foto KTP seluruh pemain dan official disatukan ke dalam 1 file PDF (Maks. 1MB).
                    </p>
                    <input
                      type="file"
                      accept=".pdf,application/pdf"
                      onChange={e => handleFileUpload('ktpGabungan', e.target.files?.[0] || null)}
                      className="w-full text-xs text-slate-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-red-600 file:text-white file:text-xs file:font-semibold hover:file:bg-red-700 cursor-pointer"
                    />
                    {docs.ktpGabungan && (
                      <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium mt-1 flex items-center space-x-1">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>{docs.ktpGabungan.name} ({docs.ktpGabungan.size})</span>
                      </p>
                    )}
                    {uploadErrors.ktpGabungan && (
                      <p className="text-[11px] text-red-500 font-medium mt-1">{uploadErrors.ktpGabungan}</p>
                    )}
                  </div>
                )}

                {/* 7. BPJS KETENAGAKERJAAN DIGABUNG 1 PDF (KHUSUS INSTANSI) */}
                {category === 'INSTANSI' && (
                  <div className="p-4 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800">
                    <label className="block text-xs font-bold text-emerald-950 dark:text-emerald-300 mb-1">
                      File BPJS Ketenagakerjaan Digabung 1 PDF <span className="text-red-500">*</span>
                    </label>
                    <p className="text-[10px] text-slate-600 dark:text-slate-400 mb-2">
                      Scan kartu / bukti kepesertaan BPJS Ketenagakerjaan seluruh pemain digabung 1 file PDF (Maks. 1MB).
                    </p>
                    <input
                      type="file"
                      accept=".pdf,application/pdf"
                      onChange={e => handleFileUpload('bpjsKetenagakerjaan', e.target.files?.[0] || null)}
                      className="w-full text-xs text-slate-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-red-600 file:text-white file:text-xs file:font-semibold hover:file:bg-red-700 cursor-pointer"
                    />
                    {docs.bpjsKetenagakerjaan && (
                      <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium mt-1 flex items-center space-x-1">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>{docs.bpjsKetenagakerjaan.name} ({docs.bpjsKetenagakerjaan.size})</span>
                      </p>
                    )}
                    {uploadErrors.bpjsKetenagakerjaan && (
                      <p className="text-[11px] text-red-500 font-medium mt-1">{uploadErrors.bpjsKetenagakerjaan}</p>
                    )}
                  </div>
                )}

              </div>
            </div>

            {/* SUBMIT BUTTON & STEP 2 FOOTER */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setActiveStep(1)}
                className="px-5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 transition flex items-center space-x-1.5 cursor-pointer"
              >
                <span>←</span>
                <span>Kembali ke Data Tim</span>
              </button>

              <div className="flex items-center space-x-3">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 transition cursor-pointer"
                >
                  Batal
                </button>

                <button
                  type="submit"
                  id="btn-submit-registration-form"
                  disabled={isSubmitting}
                  className="px-8 py-3 rounded-xl bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white text-xs font-bold uppercase tracking-wider shadow-lg shadow-red-600/30 transition flex items-center space-x-2 disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? (
                    <span>Menyimpan & Mendaftarkan Tim...</span>
                  ) : (
                    <>
                      <FileCheck className="w-4 h-4" />
                      <span>Kirim Berkas Pendaftaran</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  </form>
        )}

      </motion.div>
    </div>
  );
};
