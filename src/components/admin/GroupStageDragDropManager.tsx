import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useTournament } from '../../context/TournamentContext';
import { TournamentCategory, GroupStageItem, GroupTeamItem } from '../../types';
import {
  Shuffle,
  Plus,
  Trash2,
  Calendar,
  Layers,
  Sparkles,
  GripVertical,
  CheckCircle2,
  AlertTriangle,
  MoveRight,
  Eye,
  Settings,
  Users,
  MapPin,
  Trophy,
  Lock,
  Unlock,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';

export const GroupStageDragDropManager: React.FC = () => {
  const {
    categories,
    registrations,
    groups,
    randomizeGroupStage,
    generateMatchesFromGroups,
    moveTeamBetweenGroups,
    addGroup,
    deleteGroup,
    addTeamToGroup,
    removeTeamFromGroup,
    config,
    updateConfig,
    resetCategoryGroupsAndMatches,
    syncKnockoutFromStandings,
  } = useTournament();

  const [selectedCat, setSelectedCat] = useState<TournamentCategory>(() => categories[0]?.id || 'SMA');
  const [teamsPerGroup, setTeamsPerGroup] = useState<number>(3);
  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Reset Modal state
  const [showResetModal, setShowResetModal] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // New Group Modal / Input
  const [newGroupName, setNewGroupName] = useState('');
  const [showAddGroupInput, setShowAddGroupInput] = useState(false);

  // Add Team to Group Modal / Input
  const [activeGroupForAddTeam, setActiveGroupForAddTeam] = useState<string | null>(null);
  const [manualTeamName, setManualTeamName] = useState('');
  const [manualInstitution, setManualInstitution] = useState('');

  // Drag and Drop state (HTML5 drag & drop combined with Motion animations)
  const [draggedTeamInfo, setDraggedTeamInfo] = useState<{
    sourceGroup: string;
    teamName: string;
  } | null>(null);
  const [dragOverGroup, setDragOverGroup] = useState<string | null>(null);

  // Filter approved teams for this category
  const approvedTeams = registrations.filter(
    r => r.category === selectedCat && r.status === 'APPROVED'
  );

  // Groups for current category
  const currentCategoryGroups = groups.filter(g => g.category === selectedCat);

  // Assigned teams set to find unassigned approved teams
  const assignedTeamNames = new Set<string>();
  currentCategoryGroups.forEach(g => {
    g.teams.forEach(t => assignedTeamNames.add(t.name.trim().toLowerCase()));
  });

  const unassignedApprovedTeams = approvedTeams.filter(
    t => !assignedTeamNames.has(t.teamName.trim().toLowerCase())
  );

  // Status Pengaman Tombol Aksi Kritis (Acak, Perbarui Jadwal, Kosongkan Grup)
  // Default: true (Terkunci / Nonaktif demi keamanan turnamen)
  const isActionsLocked = config.lockGroupStageActions !== false;

  const handleToggleLock = () => {
    const nextLocked = !isActionsLocked;
    updateConfig({ lockGroupStageActions: nextLocked });
    setMessage({
      text: nextLocked
        ? '🔒 Tombol Acak, Perbarui Jadwal, dan Kosongkan Grup berhasil DIMATIKAN demi keamanan data.'
        : '🔓 Tombol Acak, Perbarui Jadwal, dan Kosongkan Grup berhasil DIAKTIFKAN. Harap berhati-hati saat menekan tombol aksi!',
      type: nextLocked ? 'success' : 'error',
    });
  };

  const handleRandomize = () => {
    if (isActionsLocked) {
      setMessage({
        text: 'Aksi dibatalkan: Tombol acak grup sedang dinonaktifkan demi keamanan. Silakan aktifkan tombol pengaman di atas terlebih dahulu.',
        type: 'error',
      });
      return;
    }

    if (approvedTeams.length < 2) {
      setMessage({
        text: `Kategori ${selectedCat} baru memiliki ${approvedTeams.length} tim berstatus APPROVED. Minimal diperlukan 2 tim untuk pembagian grup.`,
        type: 'error',
      });
      return;
    }

    setIsProcessing(true);
    setTimeout(() => {
      const res = randomizeGroupStage(selectedCat, teamsPerGroup);
      setIsProcessing(false);
      setMessage({
        text: res.message,
        type: res.success ? 'success' : 'error',
      });
    }, 400);
  };

  const handleRegenerateMatches = () => {
    if (isActionsLocked) {
      setMessage({
        text: 'Aksi dibatalkan: Tombol perbarui jadwal sedang dinonaktifkan demi keamanan. Silakan aktifkan tombol pengaman di atas terlebih dahulu.',
        type: 'error',
      });
      return;
    }

    setIsProcessing(true);
    setTimeout(() => {
      const res = generateMatchesFromGroups(selectedCat);
      setIsProcessing(false);
      setMessage({
        text: res.message,
        type: res.success ? 'success' : 'error',
      });
    }, 300);
  };

  const handleSyncKnockout = async () => {
    setIsProcessing(true);
    try {
      const res = await syncKnockoutFromStandings(selectedCat);
      setMessage({
        text: res.message,
        type: res.success ? 'success' : 'error',
      });
    } catch (err: any) {
      setMessage({
        text: `Gagal menyinkronkan bagan knockout: ${err?.message || 'Terjadi kesalahan sistem'}`,
        type: 'error',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmReset = async () => {
    if (isActionsLocked) {
      setMessage({
        text: 'Aksi dibatalkan: Tombol kosongkan grup & jadwal sedang dinonaktifkan demi keamanan. Silakan aktifkan tombol pengaman di atas terlebih dahulu.',
        type: 'error',
      });
      setShowResetModal(false);
      return;
    }

    setIsResetting(true);
    try {
      const res = await resetCategoryGroupsAndMatches(selectedCat);
      setMessage({
        text: res.message || `Grup dan jadwal kategori ${selectedCat} berhasil dikosongkan.`,
        type: res.success ? 'success' : 'error',
      });
      setShowResetModal(false);
    } catch (err: any) {
      setMessage({
        text: `Gagal mengosongkan grup: ${err?.message || 'Terjadi kesalahan sistem'}`,
        type: 'error',
      });
    } finally {
      setIsResetting(false);
    }
  };

  const handleCreateGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    addGroup(selectedCat, newGroupName.trim());
    setNewGroupName('');
    setShowAddGroupInput(false);
    setMessage({
      text: `Grup "${newGroupName.trim()}" berhasil ditambahkan ke kategori ${selectedCat}.`,
      type: 'success',
    });
  };

  const handleAddTeamSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeGroupForAddTeam || !manualTeamName.trim()) return;

    // Check if team has matching registration for logo
    const matchedReg = registrations.find(
      r => r.teamName.toLowerCase() === manualTeamName.trim().toLowerCase()
    );

    const teamItem: GroupTeamItem = {
      name: manualTeamName.trim(),
      institution: manualInstitution.trim() || matchedReg?.institutionName,
      logo: matchedReg?.teamLogo,
    };

    addTeamToGroup(selectedCat, activeGroupForAddTeam, teamItem);
    setManualTeamName('');
    setManualInstitution('');
    setActiveGroupForAddTeam(null);
    setMessage({
      text: `Tim "${manualTeamName.trim()}" berhasil ditambahkan ke ${activeGroupForAddTeam}.`,
      type: 'success',
    });
  };

  // Drag and Drop handlers
  const handleDragStart = (sourceGroup: string, teamName: string) => {
    setDraggedTeamInfo({ sourceGroup, teamName });
  };

  const handleDragOver = (e: React.DragEvent, groupName: string) => {
    e.preventDefault();
    if (dragOverGroup !== groupName) {
      setDragOverGroup(groupName);
    }
  };

  const handleDrop = (e: React.DragEvent, targetGroupName: string) => {
    e.preventDefault();
    setDragOverGroup(null);
    if (!draggedTeamInfo) return;

    const { sourceGroup, teamName } = draggedTeamInfo;
    if (sourceGroup !== targetGroupName) {
      moveTeamBetweenGroups(selectedCat, sourceGroup, targetGroupName, teamName);
      setMessage({
        text: `Tim "${teamName}" dipindahkan dari ${sourceGroup} ke ${targetGroupName}.`,
        type: 'success',
      });
    }
    setDraggedTeamInfo(null);
  };

  return (
    <div className="space-y-6">
      {/* HEADER SECTION & VISIBILITY TOGGLES */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-heading font-black text-white uppercase tracking-wide flex items-center space-x-2">
              <Shuffle className="w-5 h-5 text-amber-500" />
              <span>Sistem Pembagian Grup & Drag-and-Drop Jadwal</span>
            </h3>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
              Bagi tim pendaftar (yang berstatus <strong>APPROVED</strong>) ke dalam grup (3 tim per grup), pindahkan tim secara visual dengan drag & drop antar grup, dan hasilkan bagan knockout otomatis.
            </p>
          </div>

          {/* Visibility Controls for Klasemen */}
          <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-slate-950/80 border border-slate-800 shrink-0">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center space-x-1">
              <Eye className="w-3.5 h-3.5 text-red-500" />
              <span>Visibilitas Publik:</span>
            </span>

            {/* Switch Standalone Klasemen */}
            <label className="flex items-center space-x-2 cursor-pointer text-xs font-semibold text-slate-300">
              <input
                type="checkbox"
                checked={config.sectionsVisibility?.standaloneKlasemen !== false}
                onChange={e => {
                  updateConfig({
                    sectionsVisibility: {
                      ...config.sectionsVisibility,
                      standaloneKlasemen: e.target.checked,
                    },
                  });
                }}
                className="w-4 h-4 rounded text-red-600 focus:ring-red-500 bg-slate-900 border-slate-700"
              />
              <span>Halaman Klasemen Mandiri</span>
            </label>

            {/* Switch Widget Klasemen Landing Page */}
            <label className="flex items-center space-x-2 cursor-pointer text-xs font-semibold text-slate-300">
              <input
                type="checkbox"
                checked={config.sectionsVisibility?.klasemenLanding !== false}
                onChange={e => {
                  updateConfig({
                    sectionsVisibility: {
                      ...config.sectionsVisibility,
                      klasemenLanding: e.target.checked,
                    },
                  });
                }}
                className="w-4 h-4 rounded text-red-600 focus:ring-red-500 bg-slate-900 border-slate-700"
              />
              <span>Widget Landing Page</span>
            </label>
          </div>
        </div>

        {/* CATEGORY SELECTOR TABS */}
        <div className="pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-2 overflow-x-auto py-1">
            <span className="text-xs font-bold text-slate-400 uppercase mr-1">Kategori:</span>
            {categories.map(cat => {
              const isSelected = selectedCat === cat.id;
              const catApproved = registrations.filter(
                r => r.category === cat.id && r.status === 'APPROVED'
              ).length;

              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCat(cat.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-2 cursor-pointer ${
                    isSelected
                      ? 'bg-red-600 text-white shadow-md shadow-red-950/40'
                      : 'bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800'
                  }`}
                >
                  <span>{cat.name}</span>
                  <span className="px-1.5 py-0.2 rounded-full bg-black/40 text-[10px] font-mono">
                    {catApproved} Tim
                  </span>
                </button>
              );
            })}
          </div>

          <div className="text-xs text-slate-400 flex items-center space-x-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>
              {approvedTeams.length} Tim Berstatus <strong>APPROVED</strong> Siap Diundi
            </span>
          </div>
        </div>
      </div>

      {/* ALERT MESSAGE */}
      <AnimatePresence>
        {message && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className={`p-4 rounded-xl border text-xs font-semibold flex items-center justify-between ${
              message.type === 'success'
                ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-200'
                : 'bg-red-950/60 border-red-500/50 text-red-200'
            }`}
          >
            <span>{message.text}</span>
            <button
              onClick={() => setMessage(null)}
              className="text-slate-400 hover:text-white ml-2 text-xs"
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PENGAMAN TOMBOL AKSI KRITIS (ACAK, PERBARUI JADWAL, KOSONGKAN GRUP) */}
      <div
        className={`p-4 rounded-2xl border transition-all duration-300 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
          isActionsLocked
            ? 'bg-slate-900/90 border-emerald-500/30 shadow-md'
            : 'bg-gradient-to-r from-amber-950/40 via-red-950/20 to-slate-900 border-amber-500/50 shadow-lg shadow-amber-950/20'
        }`}
      >
        <div className="flex items-start sm:items-center space-x-3.5">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border transition-colors ${
              isActionsLocked
                ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-400'
                : 'bg-amber-950/80 border-amber-500/60 text-amber-400 animate-pulse'
            }`}
          >
            {isActionsLocked ? (
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
            ) : (
              <ShieldAlert className="w-5 h-5 text-amber-400" />
            )}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-white tracking-wide">
                Proteksi Tombol Aksi Kritis:
              </span>
              <span
                className={`text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider border ${
                  isActionsLocked
                    ? 'bg-emerald-950 text-emerald-300 border-emerald-500/40'
                    : 'bg-amber-950 text-amber-300 border-amber-500/50 animate-pulse'
                }`}
              >
                {isActionsLocked ? '🔒 TOMBOL DIMATIKAN (MODE AMAN)' : '⚠️ TOMBOL AKTIF (HATI-HATI)'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
              {isActionsLocked
                ? 'Tombol Acak, Perbarui Jadwal, dan Kosongkan Grup sedang dimatikan agar jadwal & data aman dari ketidaksengajaan klik saat turnamen berjalan.'
                : 'Perhatian: Tombol Acak, Perbarui Jadwal, dan Kosongkan Grup saat ini AKTIF. Pastikan tidak menimpa jadwal atau data pertandingan yang sedang berjalan!'}
            </p>
          </div>
        </div>

        {/* Toggle Button */}
        <div className="flex items-center space-x-3 self-end sm:self-auto shrink-0">
          <button
            type="button"
            onClick={handleToggleLock}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center space-x-2 cursor-pointer shadow-sm ${
              isActionsLocked
                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-black shadow-amber-500/20'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20'
            }`}
          >
            {isActionsLocked ? (
              <>
                <Unlock className="w-4 h-4" />
                <span>AKTIFKAN TOMBOL</span>
              </>
            ) : (
              <>
                <Lock className="w-4 h-4" />
                <span>MATIKAN TOMBOL (KUNCI AMAN)</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ACTION TOOLBAR: RANDOMIZE & CONTROLS */}
      <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center space-x-2 bg-slate-950 p-2 rounded-xl border border-slate-800 text-xs">
            <span className="font-semibold text-slate-300">Kuota Tim / Grup:</span>
            <input
              type="number"
              min={2}
              max={6}
              value={teamsPerGroup}
              onChange={e => setTeamsPerGroup(Math.max(2, Math.min(6, Number(e.target.value) || 3)))}
              className="w-12 bg-slate-900 border border-slate-700 rounded px-2 py-0.5 text-center font-bold text-white text-xs"
            />
          </div>

          {/* Randomize Button */}
          <button
            type="button"
            onClick={handleRandomize}
            disabled={isActionsLocked || isProcessing || approvedTeams.length < 2}
            className={`px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition flex items-center space-x-2 ${
              isActionsLocked
                ? 'bg-slate-800/80 text-slate-500 border border-slate-700/60 cursor-not-allowed opacity-60'
                : 'bg-gradient-to-r from-amber-500 to-red-600 hover:from-amber-400 hover:to-red-500 text-slate-950 font-black shadow-lg shadow-amber-500/20 cursor-pointer disabled:opacity-50'
            }`}
            title={
              isActionsLocked
                ? 'Tombol Acak sedang DIMATIKAN demi keamanan. Aktifkan tombol pengaman di atas jika ingin mengacak grup.'
                : `Acak sistem fase grup (${teamsPerGroup} Tim/Grup)`
            }
          >
            {isActionsLocked ? (
              <Lock className="w-4 h-4 text-slate-500" />
            ) : (
              <Shuffle className={`w-4 h-4 ${isProcessing ? 'animate-spin' : ''}`} />
            )}
            <span>
              {isActionsLocked
                ? '🔒 Acak Grup (Dimatikan)'
                : `🎲 Acak Sistem Fase Grup (${teamsPerGroup} Tim/Grup)`}
            </span>
          </button>

          {/* Regenerate Matches from current group formation */}
          {currentCategoryGroups.length > 0 && (
            <button
              type="button"
              onClick={handleRegenerateMatches}
              disabled={isActionsLocked || isProcessing}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold border transition flex items-center space-x-2 ${
                isActionsLocked
                  ? 'bg-slate-800/80 text-slate-500 border-slate-700/60 cursor-not-allowed opacity-60'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border-slate-700 cursor-pointer'
              }`}
              title={
                isActionsLocked
                  ? 'Tombol Perbarui Jadwal sedang DIMATIKAN demi keamanan. Aktifkan tombol pengaman di atas jika ingin memperbarui jadwal.'
                  : 'Perbarui Jadwal Pertandingan & Bagan Knockout berdasarkan susunan grup terkini'
              }
            >
              {isActionsLocked ? (
                <Lock className="w-4 h-4 text-slate-500" />
              ) : (
                <Calendar className="w-4 h-4 text-emerald-400" />
              )}
              <span>
                {isActionsLocked
                  ? '🔒 Perbarui Jadwal (Dimatikan)'
                  : 'Perbarui Jadwal & Knockout'}
              </span>
            </button>
          )}

          {/* Tombol Sinkronkan Bagan 16 Besar / Knockout dari Klasemen */}
          {currentCategoryGroups.length > 0 && (
            <button
              type="button"
              onClick={handleSyncKnockout}
              disabled={isProcessing}
              className="px-4 py-2.5 rounded-xl bg-indigo-950/80 hover:bg-indigo-900 text-indigo-200 hover:text-white text-xs font-bold border border-indigo-700/80 transition flex items-center space-x-2 cursor-pointer shadow-sm"
              title="Cek klasemen terkini dan masukkan tim peringkat 1 & 2 ke jadwal Babak 16 Besar s/d Final"
            >
              <Trophy className="w-4 h-4 text-amber-400" />
              <span>⚡ Sinkronkan 16 Besar & Knockout</span>
            </button>
          )}

          {/* Tombol Reset / Kosongkan Grup & Jadwal Kategori Ini */}
          {currentCategoryGroups.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (isActionsLocked) {
                  setMessage({
                    text: 'Aksi dibatalkan: Tombol kosongkan grup sedang dinonaktifkan demi keamanan. Aktifkan tombol pengaman di atas terlebih dahulu.',
                    type: 'error',
                  });
                  return;
                }
                setShowResetModal(true);
              }}
              disabled={isActionsLocked || isProcessing || isResetting}
              className={`px-3.5 py-2.5 rounded-xl text-xs font-bold border transition flex items-center space-x-1.5 shadow-sm ${
                isActionsLocked
                  ? 'bg-slate-800/80 text-slate-500 border-slate-700/60 cursor-not-allowed opacity-60'
                  : 'bg-red-950/60 hover:bg-red-900 text-red-300 hover:text-white border-red-800/80 cursor-pointer disabled:opacity-50'
              }`}
              title={
                isActionsLocked
                  ? 'Tombol Kosongkan Grup sedang DIMATIKAN demi keamanan. Aktifkan tombol pengaman di atas jika ingin mengosongkan grup.'
                  : `Kosongkan semua pembagian grup & jadwal untuk kategori ${selectedCat}`
              }
            >
              {isActionsLocked ? (
                <Lock className="w-4 h-4 text-slate-500" />
              ) : (
                <Trash2 className="w-4 h-4 text-red-400" />
              )}
              <span>
                {isActionsLocked
                  ? '🔒 Kosongkan Grup (Dimatikan)'
                  : 'Kosongkan Grup & Jadwal'}
              </span>
            </button>
          )}
        </div>

        {/* Manual Add Group Button */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-400">
            <MapPin className="w-3.5 h-3.5 text-red-500 shrink-0" />
            <span>Venue Otomatis: <strong className="text-white">{config.venueName || 'Gedung Utama GOR Tawang Alun Banyuwangi'}</strong></span>
          </div>

          <button
            onClick={() => setShowAddGroupInput(true)}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold border border-slate-700 transition flex items-center space-x-1.5 cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4 text-red-400" />
            <span>Tambah Grup Manual</span>
          </button>
        </div>
      </div>

      {/* MODAL / INPUT: TAMBAH GRUP BARU */}
      {showAddGroupInput && (
        <form
          onSubmit={handleCreateGroup}
          className="p-4 rounded-xl bg-slate-900 border border-slate-700 flex flex-wrap items-center gap-3 animate-fadeIn"
        >
          <span className="text-xs font-bold text-white uppercase">Nama Grup Baru:</span>
          <input
            type="text"
            placeholder="Contoh: Grup C, Grup D..."
            value={newGroupName}
            onChange={e => setNewGroupName(e.target.value)}
            className="flex-1 min-w-[200px] px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500"
            autoFocus
          />
          <button
            type="submit"
            className="px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold cursor-pointer"
          >
            Simpan Grup
          </button>
          <button
            type="button"
            onClick={() => setShowAddGroupInput(false)}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs cursor-pointer"
          >
            Batal
          </button>
        </form>
      )}

      {/* UNASSIGNED APPROVED TEAMS TRAY */}
      {unassignedApprovedTeams.length > 0 && (
        <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-500/30 space-y-2">
          <div className="flex items-center space-x-2 text-xs font-bold text-amber-400">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <span>{unassignedApprovedTeams.length} Tim Approved Belum Masuk Grup:</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {unassignedApprovedTeams.map(t => (
              <div
                key={t.id}
                className="px-3 py-1.5 rounded-lg bg-slate-900 border border-amber-500/30 text-xs text-white flex items-center space-x-2"
              >
                <span className="font-bold">{t.teamName}</span>
                <span className="text-[10px] text-slate-400">({t.institutionName})</span>
                {currentCategoryGroups.length > 0 && (
                  <select
                    onChange={e => {
                      if (e.target.value) {
                        addTeamToGroup(selectedCat, e.target.value, {
                          name: t.teamName,
                          institution: t.institutionName,
                          logo: t.teamLogo,
                        });
                      }
                    }}
                    defaultValue=""
                    className="bg-slate-950 text-[10px] font-bold text-amber-400 border border-slate-700 rounded px-1.5 py-0.5 cursor-pointer"
                  >
                    <option value="" disabled>
                      + Masukkan ke...
                    </option>
                    {currentCategoryGroups.map(g => (
                      <option key={g.id} value={g.groupName}>
                        {g.groupName}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* GROUPS DRAG & DROP CARDS GRID */}
      {currentCategoryGroups.length === 0 ? (
        <div className="p-12 rounded-2xl bg-slate-900 border border-slate-800 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-slate-800 flex items-center justify-center mx-auto text-slate-500">
            <Layers className="w-7 h-7 text-amber-500" />
          </div>
          <div className="space-y-1">
            <h4 className="font-bold text-white text-base">Belum Ada Pembagian Grup untuk {selectedCat}</h4>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Klik tombol <strong>"🎲 Acak Sistem Fase Grup"</strong> di atas untuk membagi tim approved secara otomatis atau gunakan <strong>"Tambah Grup Manual"</strong>.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {currentCategoryGroups.map(grp => {
            const isDragOver = dragOverGroup === grp.groupName;

            return (
              <motion.div
                key={grp.id}
                layout
                onDragOver={e => handleDragOver(e, grp.groupName)}
                onDrop={e => handleDrop(e, grp.groupName)}
                className={`rounded-2xl border transition shadow-xl flex flex-col justify-between overflow-hidden ${
                  isDragOver
                    ? 'bg-slate-850 border-amber-500 ring-2 ring-amber-500/40'
                    : 'bg-slate-900 border-slate-800'
                }`}
              >
                {/* Group Header */}
                <div className="p-4 bg-slate-850/80 border-b border-slate-800 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                    <h4 className="font-black text-white text-sm uppercase tracking-wider font-heading">
                      {grp.groupName}
                    </h4>
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-slate-800 text-slate-300">
                      {grp.teams.length} Tim
                    </span>
                  </div>

                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => setActiveGroupForAddTeam(grp.groupName)}
                      className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                      title="Tambah Tim Manual ke Grup Ini"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        if (isActionsLocked) {
                          setMessage({
                            text: 'Tombol aksi sedang dimatikan demi keamanan. Aktifkan sakelar pengaman di atas untuk menghapus grup.',
                            type: 'error',
                          });
                          return;
                        }
                        if (confirm(`Hapus ${grp.groupName}? Seluruh tim di grup ini akan dilepas.`)) {
                          deleteGroup(selectedCat, grp.groupName);
                        }
                      }}
                      className={`p-1 rounded-lg transition ${
                        isActionsLocked
                          ? 'bg-slate-800/50 text-slate-600 cursor-not-allowed'
                          : 'bg-slate-800 hover:bg-red-950 text-slate-400 hover:text-red-400 cursor-pointer'
                      }`}
                      title={isActionsLocked ? 'Hapus grup dinonaktifkan (mode aman)' : 'Hapus Grup'}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Teams List (Draggable Cards) */}
                <div className="p-4 space-y-2 flex-1 min-h-[160px]">
                  {grp.teams.length === 0 ? (
                    <div className="h-full flex items-center justify-center p-6 border-2 border-dashed border-slate-800 rounded-xl text-center text-xs text-slate-500 italic">
                      Drag tim ke sini atau klik (+) untuk menambah tim
                    </div>
                  ) : (
                    grp.teams.map((t, tIdx) => (
                      <motion.div
                        key={t.name}
                        layout
                        draggable
                        onDragStart={() => handleDragStart(grp.groupName, t.name)}
                        className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 hover:border-slate-700 flex items-center justify-between gap-2 shadow-sm cursor-grab active:cursor-grabbing group"
                      >
                        <div className="flex items-center space-x-2.5 truncate">
                          <GripVertical className="w-4 h-4 text-slate-600 group-hover:text-slate-400 shrink-0" />
                          <span className="w-5 h-5 rounded-md bg-slate-900 border border-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-400 shrink-0">
                            {tIdx + 1}
                          </span>
                          <div className="truncate">
                            <p className="font-bold text-white text-xs truncate">
                              {t.name}
                            </p>
                            {t.institution && (
                              <p className="text-[10px] text-slate-400 truncate">
                                {t.institution}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Quick Actions (Move to another group or remove) */}
                        <div className="flex items-center space-x-1 shrink-0">
                          {currentCategoryGroups.length > 1 && (
                            <select
                              onChange={e => {
                                if (e.target.value && e.target.value !== grp.groupName) {
                                  moveTeamBetweenGroups(selectedCat, grp.groupName, e.target.value, t.name);
                                }
                              }}
                              value={grp.groupName}
                              className="bg-slate-900 text-[10px] font-bold text-slate-300 border border-slate-700 rounded px-1.5 py-0.5 cursor-pointer"
                              title="Pindahkan ke grup lain"
                            >
                              {currentCategoryGroups.map(otherG => (
                                <option key={otherG.id} value={otherG.groupName}>
                                  {otherG.groupName}
                                </option>
                              ))}
                            </select>
                          )}

                          <button
                            onClick={() => removeTeamFromGroup(selectedCat, grp.groupName, t.name)}
                            className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-slate-900 transition cursor-pointer"
                            title="Keluarkan dari grup"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </motion.div>
                    ))
                  )}
                </div>

                {/* Footer Group Indicator */}
                <div className="px-4 py-2 bg-slate-950/60 border-t border-slate-800/80 text-[10px] text-slate-500 flex items-center justify-between">
                  <span>💡 Geser (drag) tim antar kartu grup</span>
                  <span className="font-mono">{grp.teams.length}/{teamsPerGroup} Slot</span>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* MODAL: TAMBAH TIM MANUAL KE GRUP */}
      {activeGroupForAddTeam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
          <form
            onSubmit={handleAddTeamSubmit}
            className="w-full max-w-md p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h4 className="font-bold text-white text-sm uppercase">
                Tambah Tim ke {activeGroupForAddTeam}
              </h4>
              <button
                type="button"
                onClick={() => setActiveGroupForAddTeam(null)}
                className="text-slate-400 hover:text-white text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Pilih dari Tim Terdaftar (Approved):
                </label>
                <select
                  onChange={e => {
                    const found = approvedTeams.find(t => t.teamName === e.target.value);
                    if (found) {
                      setManualTeamName(found.teamName);
                      setManualInstitution(found.institutionName || '');
                    }
                  }}
                  defaultValue=""
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white"
                >
                  <option value="" disabled>
                    -- Pilih Tim --
                  </option>
                  {approvedTeams.map(t => (
                    <option key={t.id} value={t.teamName}>
                      {t.teamName} ({t.institutionName})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Atau Ketik Nama Tim:
                </label>
                <input
                  type="text"
                  placeholder="Nama Tim..."
                  value={manualTeamName}
                  onChange={e => setManualTeamName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Asal Sekolah / Instansi:
                </label>
                <input
                  type="text"
                  placeholder="Nama Sekolah atau Klub..."
                  value={manualInstitution}
                  onChange={e => setManualInstitution(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white"
                />
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end space-x-2">
              <button
                type="button"
                onClick={() => setActiveGroupForAddTeam(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-xs font-bold text-white cursor-pointer"
              >
                Tambah Tim
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL KONFIRMASI KOSONGKAN GRUP & JADWAL */}
      {showResetModal && !isActionsLocked && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md p-6 rounded-2xl bg-slate-900 border border-red-500/30 shadow-2xl space-y-4">
            <div className="flex items-center space-x-3 text-red-500">
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 shrink-0">
                <Trash2 className="w-6 h-6 text-red-400" />
              </div>
              <div>
                <h4 className="font-bold text-white text-base">
                  Kosongkan Grup &amp; Jadwal Kategori {categories.find(c => c.id === selectedCat)?.name || selectedCat}?
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">Tindakan ini akan mengosongkan grup dan jadwal pertandingan.</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 space-y-2">
              <p className="text-slate-300 leading-relaxed">
                Semua pembagian grup ({currentCategoryGroups.length} grup), jadwal pertandingan fase grup, dan data klasemen pada kategori <strong className="text-amber-400 font-bold">{categories.find(c => c.id === selectedCat)?.name || selectedCat}</strong> akan dihapus dari sistem dan database.
              </p>
              <p className="text-emerald-400 text-[11px] font-medium flex items-center space-x-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                <span>Data registrasi tim ({approvedTeams.length} tim APPROVED) tetap aman dan tidak akan terhapus.</span>
              </p>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                disabled={isResetting}
                onClick={() => setShowResetModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isResetting || isActionsLocked}
                onClick={handleConfirmReset}
                className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition flex items-center space-x-2 cursor-pointer shadow-lg shadow-red-600/30 disabled:opacity-50"
              >
                {isResetting ? (
                  <>
                    <Sparkles className="w-3.5 h-3.5 animate-spin" />
                    <span>Mengosongkan...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Ya, Kosongkan Kategori Ini</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
