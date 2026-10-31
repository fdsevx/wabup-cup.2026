import React, { useState, useMemo, useEffect } from 'react';
import { useTournament } from '../../context/TournamentContext';
import { MatchItem, MatchStatus, TournamentCategory, MatchEvent, PlayerItem } from '../../types';
import {
  Calendar,
  Clock,
  MapPin,
  Flame,
  Plus,
  Trash2,
  Edit,
  Save,
  CheckCircle2,
  AlertTriangle,
  Activity,
  Trophy,
  Filter,
  Search,
  ChevronDown,
  X,
  User,
  Shield,
  RefreshCw,
  Zap,
  Radio,
  Maximize2,
  Minimize2,
  Monitor
} from 'lucide-react';

const DEFAULT_PITCH = 'Gedung Utama GOR Tawang Alun Banyuwangi';

export const LiveScoreManagerTab: React.FC = () => {
  const {
    matches,
    updateMatchLiveScore,
    updateMatch,
    deleteMatch,
    addMatch,
    categories,
    registrations,
    players,
    currentAdmin,
    refreshDataFromServer,
    isSyncingWithServer,
    syncKnockoutFromStandings,
  } = useTournament();

  const [isRefreshingMatches, setIsRefreshingMatches] = useState(false);
  const [isSyncingKnockout, setIsSyncingKnockout] = useState(false);

  const handleQuickSyncKnockout = async () => {
    setIsSyncingKnockout(true);
    try {
      const res = await syncKnockoutFromStandings(selectedCat as TournamentCategory | 'ALL');
      setSuccessMsg(res.message);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      alert(`Gagal menyinkronkan bagan knockout: ${err?.message || 'Terjadi kesalahan sistem'}`);
    } finally {
      setIsSyncingKnockout(false);
    }
  };

  const handleRefreshMatches = async () => {
    try {
      setIsRefreshingMatches(true);
      await refreshDataFromServer();
      setSuccessMsg('Data jadwal pertandingan & skor berhasil disinkronkan!');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err) {
      console.error('Error refreshing matches:', err);
    } finally {
      setIsRefreshingMatches(false);
    }
  };

  // Role permissions evaluation
  // super_admin, panitia_inti, panitia_umum: DAPAT edit, delete, tambah jadwal pertandingan lengkap
  // wasit & live_score: HANYA DAPAT input score, tambah gol dan pelanggaran
  const isSuperAdmin = currentAdmin?.role === 'SUPERADMIN';
  const isPanitiaInti = currentAdmin?.role === 'PANITIA_INTI' || currentAdmin?.role === 'PANITIA';
  const isPanitiaUmum = currentAdmin?.role === 'PANITIA_UMUM';
  const canFullManageSchedule = isSuperAdmin || isPanitiaInti || isPanitiaUmum;

  const [selectedCat, setSelectedCat] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<'ALL' | 'LIVE' | 'UPCOMING' | 'FINISHED'>('ALL');
  const [selectedGroup, setSelectedGroup] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [savingMatchId, setSavingMatchId] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [scheduleWarning, setScheduleWarning] = useState<string | null>(null);

  // Live Focus Panel state
  const [focusedMatchId, setFocusedMatchId] = useState<string | null>(null);
  const [isFocusPanelOpen, setIsFocusPanelOpen] = useState(true);
  const [isStandaloneMode, setIsStandaloneMode] = useState(false);

  // Close standalone mode on ESC key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isStandaloneMode) {
        setIsStandaloneMode(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isStandaloneMode]);

  // Quick edit states map (matchId -> editable values)
  const [localScores, setLocalScores] = useState<Record<string, {
    scoreA: number | undefined;
    scoreB: number | undefined;
    status: MatchStatus;
    liveMinute: string;
    events: MatchEvent[];
  }>>({});

  // Add Match Modal
  const [isAddMatchOpen, setIsAddMatchOpen] = useState(false);
  const [newMatchData, setNewMatchData] = useState<Partial<MatchItem>>({
    category: 'SMA',
    round: 'Penyisihan Grup',
    pitch: DEFAULT_PITCH,
    status: 'UPCOMING',
    teamA: { name: '', score: 0 },
    teamB: { name: '', score: 0 },
    date: new Date().toISOString().split('T')[0],
    time: '08:00',
  });

  // Edit Match Modal (Full Schedule Editing for Admins)
  const [editingMatch, setEditingMatch] = useState<MatchItem | null>(null);
  const [editMatchForm, setEditMatchForm] = useState<{
    category: TournamentCategory;
    round: string;
    group?: string;
    pitch: string;
    date: string;
    time: string;
    teamAName: string;
    teamBName: string;
  } | null>(null);

  // Event Logger Modal (Goal & Foul Cards)
  const [eventModalData, setEventModalData] = useState<{
    match: MatchItem;
    type: 'GOAL' | 'YELLOW' | 'RED';
    teamSide: 'A' | 'B';
    playerName: string;
    isCustomPlayer: boolean;
    customName: string;
    minute: string;
  } | null>(null);

  // Helper to retrieve approved teams in category
  const getApprovedTeams = (cat: string) => {
    return registrations
      .filter(r => r.category === cat && r.status === 'APPROVED')
      .sort((a, b) => a.teamName.localeCompare(b.teamName));
  };

  // Helper to check if the exact same fixture already exists in the same category, round, and group
  const checkDuplicateFixture = (
    cat: string,
    round: string,
    group: string | undefined,
    teamA: string,
    teamB: string,
    excludeMatchId?: string
  ) => {
    const normRound = (round || '').trim().toLowerCase();
    const normGroup = (group || '').trim().toLowerCase();
    const normA = teamA.trim().toLowerCase();
    const normB = teamB.trim().toLowerCase();

    return matches.some(m => {
      if (excludeMatchId && String(m.id) === String(excludeMatchId)) return false;
      if (m.category !== cat) return false;

      const mRound = (m.round || '').trim().toLowerCase();
      const mGroup = (m.group || '').trim().toLowerCase();
      if (mRound !== normRound || mGroup !== normGroup) return false;

      const mA = (m.teamA?.name || '').trim().toLowerCase();
      const mB = (m.teamB?.name || '').trim().toLowerCase();

      return (mA === normA && mB === normB) || (mA === normB && mB === normA);
    });
  };

  // Status counts for the selected category
  const statusCounts = useMemo(() => {
    const catMatches =
      selectedCat === 'ALL'
        ? matches
        : matches.filter(m => m.category === selectedCat);

    const live = catMatches.filter(m => m.status === 'LIVE').length;
    const upcoming = catMatches.filter(m => m.status === 'UPCOMING').length;
    const finished = catMatches.filter(m => m.status === 'FINISHED').length;

    return {
      all: catMatches.length,
      live,
      upcoming,
      finished,
    };
  }, [matches, selectedCat]);

  const isKnockoutMatch = (m: MatchItem) =>
    !m.group ||
    m.round.toLowerCase().includes('final') ||
    m.round.toLowerCase().includes('besar') ||
    m.round.toLowerCase().includes('play') ||
    m.round.toLowerCase().includes('gugur');

  // Group Filter stats for the selected category and status
  const availableGroupStats = useMemo(() => {
    const baseMatches = matches.filter(m => {
      if (selectedCat !== 'ALL' && m.category !== selectedCat) return false;
      if (selectedStatus !== 'ALL' && m.status !== selectedStatus) return false;
      return true;
    });

    const groupCounts: Record<string, number> = {};
    let knockoutCount = 0;

    baseMatches.forEach(m => {
      if (isKnockoutMatch(m)) {
        knockoutCount += 1;
      } else {
        const g = (m.group || '').trim();
        if (g) {
          groupCounts[g] = (groupCounts[g] || 0) + 1;
        }
      }
    });

    const sortedGroups = Object.keys(groupCounts)
      .sort((a, b) => a.localeCompare(b))
      .map(name => ({
        name,
        count: groupCounts[name],
      }));

    return {
      total: baseMatches.length,
      groups: sortedGroups,
      knockoutCount,
    };
  }, [matches, selectedCat, selectedStatus]);

  // Filter matches by category, status, group, and search query (Smart Sorted: LIVE -> Babak Gugur -> Fase Grup)
  const filteredMatches = useMemo(() => {
    const list = matches.filter(m => {
      if (selectedCat !== 'ALL' && m.category !== selectedCat) return false;
      if (selectedStatus !== 'ALL' && m.status !== selectedStatus) return false;
      if (selectedGroup !== 'ALL') {
        if (selectedGroup === 'KNOCKOUT') {
          if (!isKnockoutMatch(m)) return false;
        } else {
          if ((m.group || '').trim() !== selectedGroup) return false;
        }
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          m.teamA.name.toLowerCase().includes(q) ||
          m.teamB.name.toLowerCase().includes(q) ||
          m.round.toLowerCase().includes(q) ||
          (m.group && m.group.toLowerCase().includes(q))
        );
      }
      return true;
    });

    return list.sort((a, b) => {
      // 1. LIVE matches first
      if (a.status === 'LIVE' && b.status !== 'LIVE') return -1;
      if (b.status === 'LIVE' && a.status !== 'LIVE') return 1;

      // 2. Knockout matches prioritized over Group matches
      const aIsKo = isKnockoutMatch(a);
      const bIsKo = isKnockoutMatch(b);
      if (aIsKo && !bIsKo) return -1;
      if (!aIsKo && bIsKo) return 1;

      // 3. Within Knockout: Final -> Semifinal -> QF -> 16 Besar -> 32 Besar -> Play-off
      if (aIsKo && bIsKo) {
        const getRoundWeight = (r: string) => {
          const lower = r.toLowerCase();
          if (lower.includes('grand final')) return 100;
          if (lower.includes('juara 3')) return 90;
          if (lower.includes('semifinal')) return 80;
          if (lower.includes('perempat') || lower.includes('8 besar')) return 70;
          if (lower.includes('16 besar')) return 60;
          if (lower.includes('32 besar')) return 50;
          if (lower.includes('play')) return 40;
          return 30;
        };
        const diffWeight = getRoundWeight(b.round) - getRoundWeight(a.round);
        if (diffWeight !== 0) return diffWeight;
      }

      // 4. By Date and Match Number
      if (a.date && b.date && a.date !== b.date) {
        return a.date.localeCompare(b.date);
      }
      return (a.matchNumber || 0) - (b.matchNumber || 0);
    });
  }, [matches, selectedCat, selectedStatus, selectedGroup, searchQuery]);

  // Determine active live matches for operator focus mode
  const isMatchLive = (status: MatchStatus) => {
    return status === 'LIVE';
  };

  // Strictly only matches that are currently LIVE
  const liveMatches = useMemo(() => {
    return matches.filter(
      m => isMatchLive(m.status) && (selectedCat === 'ALL' || m.category === selectedCat)
    );
  }, [matches, selectedCat]);

  // Active match currently focused by operator (STRICTLY ONLY LIVE MATCHES)
  const currentFocusedMatch = useMemo(() => {
    if (liveMatches.length === 0) return null;
    if (focusedMatchId) {
      const found = liveMatches.find(m => m.id === focusedMatchId);
      if (found) return found;
    }
    return liveMatches[0];
  }, [focusedMatchId, liveMatches]);

  // Active match for standalone operator mode (can be LIVE, UPCOMING, or any match)
  const activeStandaloneMatch = useMemo(() => {
    if (focusedMatchId) {
      const found = matches.find(m => m.id === focusedMatchId);
      if (found) return found;
    }
    if (liveMatches.length > 0) return liveMatches[0];
    if (matches.length > 0) return matches[0];
    return null;
  }, [focusedMatchId, liveMatches, matches]);

  // Helper to get or initialize match edit state
  const getMatchState = (m: MatchItem) => {
    return (
      localScores[m.id] || {
        scoreA: m.teamA.score ?? 0,
        scoreB: m.teamB.score ?? 0,
        status: m.status,
        liveMinute: m.liveMinute || '',
        events: m.events || [],
      }
    );
  };

  const handleUpdateField = (
    matchId: string,
    field: 'scoreA' | 'scoreB' | 'status' | 'liveMinute' | 'events',
    val: any,
    origMatch: MatchItem
  ) => {
    const curr = getMatchState(origMatch);
    setLocalScores(prev => ({
      ...prev,
      [matchId]: {
        ...curr,
        [field]: val,
      },
    }));
  };

  const handleSaveLiveMatch = async (match: MatchItem) => {
    const curr = getMatchState(match);
    setSavingMatchId(match.id);
    try {
      await updateMatchLiveScore(
        match.id,
        curr.scoreA,
        curr.scoreB,
        curr.status,
        curr.liveMinute,
        curr.events
      );
      setLocalScores(prev => ({
        ...prev,
        [match.id]: {
          scoreA: curr.scoreA,
          scoreB: curr.scoreB,
          status: curr.status,
          liveMinute: curr.liveMinute,
          events: curr.events,
        },
      }));
      setSuccessMsg(`Match #${match.matchNumber} (${match.teamA.name} vs ${match.teamB.name}) & Klasemen berhasil disinkronkan!`);
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch (err: any) {
      alert(`Gagal menyimpan skor: ${err?.message || 'Error'}`);
    } finally {
      setSavingMatchId(null);
    }
  };

  // Open Event Modal
  const handleOpenEventModal = (
    match: MatchItem,
    type: 'GOAL' | 'YELLOW' | 'RED',
    teamSide: 'A' | 'B' = 'A'
  ) => {
    const liveMin = localScores[match.id]?.liveMinute || match.liveMinute || '';
    setEventModalData({
      match,
      type,
      teamSide,
      playerName: '',
      isCustomPlayer: false,
      customName: '',
      minute: liveMin ? liveMin.replace("'", '') : '',
    });
  };

  // Save Event from Modal
  const handleSaveEventFromModal = () => {
    if (!eventModalData) return;
    const { match, type, teamSide, playerName, isCustomPlayer, customName, minute } = eventModalData;
    const finalPlayerName = isCustomPlayer ? customName.trim() : playerName.trim();

    if (!finalPlayerName) {
      alert('Silakan pilih atau masukkan nama pemain.');
      return;
    }

    const curr = getMatchState(match);
    const minuteFormatted = minute.trim() ? (minute.includes("'") ? minute.trim() : `${minute.trim()}'`) : "1'";

    const newEvent: MatchEvent = {
      id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      type,
      playerName: finalPlayerName,
      minute: minuteFormatted,
      team: teamSide,
    };

    // If GOAL, also automatically increment team score
    let newScoreA = curr.scoreA ?? 0;
    let newScoreB = curr.scoreB ?? 0;
    if (type === 'GOAL') {
      if (teamSide === 'A') newScoreA += 1;
      else newScoreB += 1;
    }

    setLocalScores(prev => ({
      ...prev,
      [match.id]: {
        ...curr,
        scoreA: newScoreA,
        scoreB: newScoreB,
        events: [...curr.events, newEvent],
      },
    }));

    setEventModalData(null);
  };

  const handleRemoveEvent = (match: MatchItem, eventIndex: number) => {
    const curr = getMatchState(match);
    const removedEvent = curr.events[eventIndex];
    const filtered = curr.events.filter((_, idx) => idx !== eventIndex);

    // If removed event was a goal, decrement score accordingly
    let newScoreA = curr.scoreA ?? 0;
    let newScoreB = curr.scoreB ?? 0;
    if (removedEvent && removedEvent.type === 'GOAL') {
      const isTeamA = removedEvent.team === 'A' || removedEvent.team === match.teamA?.name;
      const isTeamB = removedEvent.team === 'B' || removedEvent.team === match.teamB?.name;
      if (isTeamA) {
        newScoreA = Math.max(0, newScoreA - 1);
      } else if (isTeamB) {
        newScoreB = Math.max(0, newScoreB - 1);
      }
    }

    setLocalScores(prev => ({
      ...prev,
      [match.id]: {
        ...curr,
        scoreA: newScoreA,
        scoreB: newScoreB,
        events: filtered,
      },
    }));
  };

  // Open Edit Match Modal
  const handleOpenEditMatch = (m: MatchItem) => {
    setEditingMatch(m);
    setEditMatchForm({
      category: m.category,
      round: m.round,
      group: m.group || '',
      pitch: m.pitch || DEFAULT_PITCH,
      date: m.date || new Date().toISOString().split('T')[0],
      time: m.time || '08:00',
      teamAName: m.teamA.name,
      teamBName: m.teamB.name,
    });
    setScheduleWarning(null);
  };

  // Save Edit Match Form
  const handleSaveEditMatch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMatch || !editMatchForm) return;

    const teamAName = editMatchForm.teamAName.trim();
    const teamBName = editMatchForm.teamBName.trim();

    if (!teamAName || !teamBName) {
      alert('Nama kedua tim wajib diisi.');
      return;
    }
    if (teamAName.toLowerCase() === teamBName.toLowerCase()) {
      setScheduleWarning('Tim A dan Tim B tidak boleh tim yang sama.');
      return;
    }

    // Check if the exact same fixture already exists in another match for the same category, round, and group
    const isDuplicate = checkDuplicateFixture(
      editMatchForm.category,
      editMatchForm.round,
      editMatchForm.group,
      teamAName,
      teamBName,
      editingMatch.id
    );

    if (isDuplicate) {
      setScheduleWarning(
        `Pertandingan antara "${teamAName}" dan "${teamBName}" sudah terdaftar di babak ${editMatchForm.round}${
          editMatchForm.group ? ` (${editMatchForm.group})` : ''
        }.`
      );
      return;
    }

    const teamAReg = registrations.find(r => r.teamName === teamAName);
    const teamBReg = registrations.find(r => r.teamName === teamBName);

    const updated: MatchItem = {
      ...editingMatch,
      category: editMatchForm.category,
      round: editMatchForm.round.trim(),
      group: editMatchForm.group?.trim() || undefined,
      pitch: editMatchForm.pitch.trim() || DEFAULT_PITCH,
      date: editMatchForm.date,
      time: editMatchForm.time,
      teamA: {
        ...editingMatch.teamA,
        name: teamAName,
        logo: teamAReg?.teamLogo || editingMatch.teamA.logo,
        institution: teamAReg?.institutionName || editingMatch.teamA.institution,
      },
      teamB: {
        ...editingMatch.teamB,
        name: teamBName,
        logo: teamBReg?.teamLogo || editingMatch.teamB.logo,
        institution: teamBReg?.institutionName || editingMatch.teamB.institution,
      },
    };

    updateMatch(updated);
    setLocalScores(prev => {
      const next = { ...prev };
      if (next[updated.id]) {
        next[updated.id] = {
          ...next[updated.id],
          scoreA: updated.teamA.score ?? 0,
          scoreB: updated.teamB.score ?? 0,
          status: updated.status,
          liveMinute: updated.liveMinute || '',
          events: updated.events || [],
        };
      }
      return next;
    });
    setEditingMatch(null);
    setEditMatchForm(null);
    setScheduleWarning(null);
    setSuccessMsg(`Jadwal Match #${updated.matchNumber} berhasil diperbarui!`);
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  // Create New Match
  const handleCreateNewMatch = (e: React.FormEvent) => {
    e.preventDefault();
    const teamAName = newMatchData.teamA?.name?.trim() || '';
    const teamBName = newMatchData.teamB?.name?.trim() || '';
    const cat = (newMatchData.category as TournamentCategory) || 'SMA';
    const round = newMatchData.round || 'Penyisihan Grup';
    const group = newMatchData.group;

    if (!teamAName || !teamBName) {
      alert('Nama kedua tim wajib dipilih.');
      return;
    }
    if (teamAName.toLowerCase() === teamBName.toLowerCase()) {
      setScheduleWarning('Tim A dan Tim B tidak boleh tim yang sama.');
      return;
    }

    const isDuplicate = checkDuplicateFixture(cat, round, group, teamAName, teamBName);
    if (isDuplicate) {
      setScheduleWarning(
        `Pertandingan antara "${teamAName}" dan "${teamBName}" sudah terdaftar di babak ${round}${
          group ? ` (${group})` : ''
        }.`
      );
      return;
    }

    const teamAReg = registrations.find(r => r.teamName === teamAName);
    const teamBReg = registrations.find(r => r.teamName === teamBName);

    const created: MatchItem = {
      id: `match-custom-${Date.now()}`,
      matchNumber: matches.length + 1,
      roundIndex: 0,
      category: cat,
      round: newMatchData.round || 'Penyisihan Grup',
      group: newMatchData.group,
      teamA: {
        name: teamAName,
        score: Number(newMatchData.teamA?.score || 0),
        logo: teamAReg?.teamLogo,
        institution: teamAReg?.institutionName,
      },
      teamB: {
        name: teamBName,
        score: Number(newMatchData.teamB?.score || 0),
        logo: teamBReg?.teamLogo,
        institution: teamBReg?.institutionName,
      },
      date: newMatchData.date || new Date().toISOString().split('T')[0],
      time: newMatchData.time || '08:00',
      pitch: newMatchData.pitch || DEFAULT_PITCH,
      status: (newMatchData.status as MatchStatus) || 'UPCOMING',
      events: [],
    };

    addMatch(created);
    setIsAddMatchOpen(false);
    setScheduleWarning(null);
    setSuccessMsg(`Jadwal Match #${created.matchNumber} (${created.teamA.name} vs ${created.teamB.name}) berhasil ditambahkan!`);
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  return (
    <div className="space-y-6">
      {/* HEADER & CONTROLS */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-heading font-black text-white uppercase tracking-wide flex items-center space-x-2">
              <Calendar className="w-5 h-5 text-red-500" />
              <span>KELOLA JADWAL, LIVE SCORE &amp; OTOMATISASI KLASEMEN</span>
            </h3>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
              {canFullManageSchedule ? (
                <>
                  Hak akses penuh: Anda dapat <strong>menambah, mengedit jadwal lengkap, menghapus, serta menginput live score</strong>. Setiap skor yang disimpan otomatis menghitung ulang klasemen dan statistik pemain secara real-time.
                </>
              ) : (
                <>
                  Hak akses petugas Wasit / Operator Live Score: Anda dapat <strong>menginput live score, menit laga, serta mencatat pencetak gol dan kartu pelanggaran</strong>.
                </>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={handleRefreshMatches}
              disabled={isRefreshingMatches || isSyncingWithServer}
              title="Segarkan data jadwal pertandingan & live score dari server tanpa reload browser"
              className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
            >
              <RefreshCw className={`w-4 h-4 ${(isRefreshingMatches || isSyncingWithServer) ? 'animate-spin text-cyan-400' : 'text-slate-400'}`} />
              <span>{(isRefreshingMatches || isSyncingWithServer) ? 'Menyinkronkan...' : 'Refresh Jadwal & Skor'}</span>
            </button>

            {/* Tombol Konsol Standalone Operator */}
            <button
              type="button"
              onClick={() => {
                setIsStandaloneMode(true);
                if (!focusedMatchId && liveMatches.length > 0) {
                  setFocusedMatchId(liveMatches[0].id);
                }
              }}
              className="px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-red-600 via-amber-600 to-orange-600 hover:from-red-500 hover:to-amber-500 text-white text-xs font-bold transition flex items-center space-x-1.5 shadow-md shadow-red-950/40 border border-amber-400/30 cursor-pointer active:scale-95 shrink-0"
              title="Buka Konsol Operator Live Score dalam Mode Standalone Layar Penuh"
            >
              <Monitor className="w-4 h-4 text-amber-300" />
              <span>Mode Standalone Operator</span>
              {liveMatches.length > 0 && (
                <span className="w-2 h-2 rounded-full bg-white animate-ping ml-0.5" />
              )}
            </button>

            {/* Tombol Tambah Jadwal Baru (Khusus Super Admin, Panitia Inti, Panitia Umum) */}
            {canFullManageSchedule && (
              <button
                onClick={() => {
                  setScheduleWarning(null);
                  setNewMatchData({
                    category: categories[0]?.id || 'SMA',
                    round: 'Penyisihan Grup',
                    pitch: DEFAULT_PITCH,
                    status: 'UPCOMING',
                    teamA: { name: '', score: 0 },
                    teamB: { name: '', score: 0 },
                    date: new Date().toISOString().split('T')[0],
                    time: '08:00',
                  });
                  setIsAddMatchOpen(true);
                }}
                className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer shadow-md shadow-red-950/40 shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah Jadwal Baru</span>
              </button>
            )}

            {/* Tombol Cepat Sinkronkan Tim Lolos Knockout */}
            {canFullManageSchedule && (
              <button
                type="button"
                onClick={handleQuickSyncKnockout}
                disabled={isSyncingKnockout}
                className="px-3.5 py-2.5 rounded-xl bg-indigo-950/80 hover:bg-indigo-900 text-indigo-200 hover:text-white text-xs font-bold border border-indigo-700/80 transition flex items-center space-x-1.5 cursor-pointer shadow-md shadow-indigo-950/40 shrink-0"
                title={`Sinkronkan tim lolos dari klasemen ke bagan knockout untuk ${selectedCat === 'ALL' ? 'SEMUA KATEGORI' : `kategori ${selectedCat}`}`}
              >
                <Trophy className={`w-4 h-4 text-amber-400 ${isSyncingKnockout ? 'animate-bounce' : ''}`} />
                <span>
                  {isSyncingKnockout
                    ? 'Menyinkronkan...'
                    : selectedCat === 'ALL'
                    ? '⚡ Sinkronkan Knockout (Semua Kategori)'
                    : `⚡ Sinkronkan Knockout (${selectedCat})`}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* CATEGORY FILTER STRIP */}
        <div className="pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-2 overflow-x-auto py-1">
            <span className="text-xs font-bold text-slate-400 uppercase mr-1">Kategori:</span>
            <button
              onClick={() => {
                setSelectedCat('ALL');
                setSelectedGroup('ALL');
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                selectedCat === 'ALL'
                  ? 'bg-red-600 text-white shadow-md'
                  : 'bg-slate-950 text-slate-300 border border-slate-800 hover:bg-slate-800'
              }`}
            >
              Semua ({matches.length})
            </button>
            {categories.map(c => {
              const count = matches.filter(m => m.category === c.id).length;
              return (
                <button
                  key={c.id}
                  onClick={() => {
                    setSelectedCat(c.id);
                    setSelectedGroup('ALL');
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center space-x-1.5 ${
                    selectedCat === c.id
                      ? 'bg-red-600 text-white shadow-md'
                      : 'bg-slate-950 text-slate-300 border border-slate-800 hover:bg-slate-800'
                  }`}
                >
                  <span>{c.name}</span>
                  <span className="px-1.5 py-0.2 rounded-full bg-black/40 text-[10px] font-mono">
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-60">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari tim atau babak..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-red-500"
            />
          </div>
        </div>

        {/* STATUS & LIVE FILTER STRIP */}
        <div className="pt-2.5 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-400 uppercase mr-1 flex items-center space-x-1">
              <Radio className="w-3.5 h-3.5 text-red-500" />
              <span>Status:</span>
            </span>

            {/* Filter Khusus Sedang Live */}
            <button
              type="button"
              onClick={() => {
                setSelectedStatus('LIVE');
                setSelectedGroup('ALL');
                setIsFocusPanelOpen(true);
              }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center space-x-2 border shadow-sm ${
                selectedStatus === 'LIVE'
                  ? 'bg-red-600 text-white border-red-500 shadow-md shadow-red-950/60 font-black'
                  : 'bg-slate-950 text-red-400 border-red-900/60 hover:bg-red-950/30'
              }`}
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
              </span>
              <span>🔴 Sedang Live</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                  selectedStatus === 'LIVE'
                    ? 'bg-black/40 text-white font-bold'
                    : 'bg-red-950 text-red-300 border border-red-800/40'
                }`}
              >
                {statusCounts.live}
              </span>
            </button>

            {/* Semua Status */}
            <button
              type="button"
              onClick={() => setSelectedStatus('ALL')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center space-x-1.5 ${
                selectedStatus === 'ALL'
                  ? 'bg-slate-200 text-slate-900 shadow font-black'
                  : 'bg-slate-950 text-slate-300 border border-slate-800 hover:bg-slate-800'
              }`}
            >
              <span>Semua Status</span>
              <span className="px-1.5 py-0.2 rounded-full bg-black/30 text-[10px] font-mono">
                {statusCounts.all}
              </span>
            </button>

            {/* Belum Dimulai */}
            <button
              type="button"
              onClick={() => setSelectedStatus('UPCOMING')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center space-x-1.5 ${
                selectedStatus === 'UPCOMING'
                  ? 'bg-blue-600 text-white shadow font-black'
                  : 'bg-slate-950 text-slate-300 border border-slate-800 hover:bg-slate-800'
              }`}
            >
              <span>⏳ Belum Dimulai</span>
              <span className="px-1.5 py-0.2 rounded-full bg-black/30 text-[10px] font-mono">
                {statusCounts.upcoming}
              </span>
            </button>

            {/* Selesai */}
            <button
              type="button"
              onClick={() => setSelectedStatus('FINISHED')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center space-x-1.5 ${
                selectedStatus === 'FINISHED'
                  ? 'bg-emerald-600 text-white shadow font-black'
                  : 'bg-slate-950 text-slate-300 border border-slate-800 hover:bg-slate-800'
              }`}
            >
              <span>🏁 Selesai</span>
              <span className="px-1.5 py-0.2 rounded-full bg-black/30 text-[10px] font-mono">
                {statusCounts.finished}
              </span>
            </button>
          </div>

          {selectedStatus === 'LIVE' && (
            <span className="text-[11px] text-amber-400 bg-amber-950/40 border border-amber-800/40 px-2.5 py-1 rounded-lg flex items-center space-x-1 font-semibold">
              <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Khusus laga LIVE (grup belum mulai disembunyikan)</span>
            </span>
          )}
        </div>

        {/* GROUP FILTER STRIP */}
        {selectedStatus === 'LIVE' ? (
          /* Filter Grup khusus Laga LIVE */
          <div className="pt-2.5 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-slate-400 uppercase mr-1 flex items-center space-x-1">
                <Filter className="w-3.5 h-3.5 text-red-500" />
                <span>Grup Laga Live:</span>
              </span>

              <button
                onClick={() => setSelectedGroup('ALL')}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition cursor-pointer ${
                  selectedGroup === 'ALL'
                    ? 'bg-red-600 text-white shadow-md shadow-red-500/20 font-black'
                    : 'bg-slate-950 text-slate-300 border border-slate-800 hover:bg-slate-800'
                }`}
              >
                Semua Grup Live ({availableGroupStats.total})
              </button>

              {availableGroupStats.groups.map(grp => (
                <button
                  key={grp.name}
                  onClick={() => setSelectedGroup(grp.name)}
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition cursor-pointer flex items-center space-x-1.5 ${
                    selectedGroup === grp.name
                      ? 'bg-red-600 text-white shadow-md shadow-red-500/20 font-black'
                      : 'bg-slate-950 text-slate-300 border border-slate-800 hover:bg-slate-800'
                  }`}
                >
                  <span>{grp.name}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                      selectedGroup === grp.name
                        ? 'bg-black/30 text-white font-bold'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {grp.count}
                  </span>
                </button>
              ))}

              {availableGroupStats.knockoutCount > 0 && (
                <button
                  onClick={() => setSelectedGroup('KNOCKOUT')}
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition cursor-pointer flex items-center space-x-1.5 ${
                    selectedGroup === 'KNOCKOUT'
                      ? 'bg-red-600 text-white shadow-md shadow-red-500/20 font-black'
                      : 'bg-slate-950 text-slate-300 border border-slate-800 hover:bg-slate-800'
                  }`}
                >
                  <span>Babak Gugur</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                      selectedGroup === 'KNOCKOUT'
                        ? 'bg-black/30 text-white font-bold'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {availableGroupStats.knockoutCount}
                  </span>
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setSelectedStatus('ALL')}
              className="text-[11px] text-slate-400 hover:text-white underline cursor-pointer"
            >
              Lihat semua grup jadwal
            </button>
          </div>
        ) : (
          /* Normal Group Filter Strip */
          <div className="pt-2.5 border-t border-slate-800/80 flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-400 uppercase mr-1 flex items-center space-x-1">
              <Filter className="w-3.5 h-3.5 text-amber-500" />
              <span>Filter Grup:</span>
            </span>

            <button
              onClick={() => setSelectedGroup('ALL')}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition cursor-pointer ${
                selectedGroup === 'ALL'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 font-black'
                  : 'bg-slate-950 text-slate-300 border border-slate-800 hover:bg-slate-800'
              }`}
            >
              Semua Jadwal ({availableGroupStats.total})
            </button>

            {availableGroupStats.knockoutCount > 0 && (
              <button
                type="button"
                onClick={() => setSelectedGroup('KNOCKOUT')}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition cursor-pointer flex items-center space-x-1.5 ${
                  selectedGroup === 'KNOCKOUT'
                    ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 font-black'
                    : 'bg-indigo-950/80 text-indigo-200 border border-indigo-700/80 hover:bg-indigo-900'
                }`}
              >
                <Trophy className="w-3.5 h-3.5 text-amber-400" />
                <span>⚡ Babak Gugur</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                    selectedGroup === 'KNOCKOUT'
                      ? 'bg-black/30 text-slate-950 font-bold'
                      : 'bg-indigo-900 text-indigo-300'
                  }`}
                >
                  {availableGroupStats.knockoutCount}
                </span>
              </button>
            )}

            {availableGroupStats.groups.map(grp => (
              <button
                key={grp.name}
                onClick={() => setSelectedGroup(grp.name)}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition cursor-pointer flex items-center space-x-1.5 ${
                  selectedGroup === grp.name
                    ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 font-black'
                    : 'bg-slate-950 text-slate-300 border border-slate-800 hover:bg-slate-800'
                }`}
              >
                <span>{grp.name}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                    selectedGroup === grp.name
                      ? 'bg-black/30 text-slate-950 font-bold'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {grp.count}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* SUCCESS BANNER */}
      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-950/60 border border-emerald-500/50 text-emerald-200 text-xs font-semibold flex items-center space-x-2 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ⚡ PANEL FOKUS LIVE MATCH: TAMPILAN FOKUS UNTUK INPUT HASIL LIVE OPERATOR */}
      {/* KHUSUS DITAMPILKAN DI "SEMUA GRUP" (SEMBUNYIKAN DI FILTER PER-GROUP)      */}
      {/* ========================================================================= */}
      {selectedGroup === 'ALL' && (
        currentFocusedMatch && isFocusPanelOpen ? (
        (() => {
          const focusedState = getMatchState(currentFocusedMatch);
          const isSavingFocused = savingMatchId === currentFocusedMatch.id;
          const isLiveNow = focusedState.status === 'LIVE';

          return (
            <div className="rounded-2xl border-2 border-red-500/80 bg-gradient-to-b from-slate-900 via-slate-900 to-[#0b1120] shadow-2xl shadow-red-950/50 p-5 md:p-6 space-y-6 relative overflow-hidden animate-fadeIn">
              {/* Glow accents */}
              <div className="absolute top-0 right-1/4 w-96 h-32 bg-red-600/10 blur-3xl pointer-events-none rounded-full" />
              <div className="absolute top-12 left-1/4 w-96 h-32 bg-amber-500/10 blur-3xl pointer-events-none rounded-full" />

              {/* TOP BAR: Header & Match Switcher */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-slate-800 relative z-10">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center space-x-1.5 px-3 py-1 rounded-full bg-red-600/20 border border-red-500/60 text-red-400 text-xs font-black uppercase tracking-wider">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-ping mr-0.5" />
                    <Radio className="w-3.5 h-3.5 text-red-400" />
                    <span>PANEL FOKUS LIVE SCORE OPERATOR</span>
                  </div>

                  <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-200 text-xs font-bold border border-slate-700">
                    Match #{currentFocusedMatch.matchNumber}
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-red-950 text-red-300 text-xs font-bold border border-red-800/60">
                    {currentFocusedMatch.category}
                  </span>
                  {currentFocusedMatch.group && (
                    <span className="px-2.5 py-1 rounded-lg bg-amber-950 text-amber-300 text-xs font-bold border border-amber-800/60">
                      {currentFocusedMatch.group}
                    </span>
                  )}
                  <span className="text-xs text-slate-400 font-medium">
                    {currentFocusedMatch.round}
                  </span>
                </div>

                {/* Match Switcher Dropdown & Controls */}
                <div className="flex flex-wrap items-center gap-2">
                  {liveMatches.length > 1 && (
                    <div className="flex items-center space-x-1.5">
                      <span className="text-[11px] text-slate-400 hidden sm:inline">Ganti Laga Live:</span>
                      <select
                        value={currentFocusedMatch.id}
                        onChange={e => setFocusedMatchId(e.target.value)}
                        className="bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white font-bold focus:outline-none focus:border-red-500 cursor-pointer"
                      >
                        {liveMatches.map(m => (
                          <option key={m.id} value={m.id}>
                            🔴 #{m.matchNumber} [{m.category}] {m.teamA.name} vs {m.teamB.name} {m.liveMinute ? `(${m.liveMinute})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Toggle filter mode directly from focus panel */}
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedStatus === 'LIVE') {
                        setSelectedStatus('ALL');
                      } else {
                        setSelectedStatus('LIVE');
                      }
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer border ${
                      selectedStatus === 'LIVE'
                        ? 'bg-red-600 text-white border-red-500 shadow-md shadow-red-950'
                        : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'
                    }`}
                    title="Beralih antara filter khusus laga LIVE atau semua jadwal"
                  >
                    <Radio className="w-3.5 h-3.5" />
                    <span>{selectedStatus === 'LIVE' ? '🔴 Khusus Live' : '📋 Semua Jadwal'}</span>
                  </button>

                  {/* Tombol Buka Mode Standalone */}
                  <button
                    type="button"
                    onClick={() => {
                      setIsStandaloneMode(true);
                      setFocusedMatchId(currentFocusedMatch.id);
                    }}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer bg-gradient-to-r from-amber-600 via-orange-600 to-red-600 hover:from-amber-500 hover:to-red-500 text-white shadow-md shadow-red-950/40 border border-amber-400/30 active:scale-95"
                    title="Buka Panel Fokus Live Score dalam Mode Standalone Layar Penuh (Konsol Operator)"
                  >
                    <Maximize2 className="w-3.5 h-3.5 text-amber-200" />
                    <span className="hidden sm:inline">Mode Standalone</span>
                    <span className="sm:hidden">Standalone</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsFocusPanelOpen(false)}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition text-xs cursor-pointer"
                    title="Tutup Panel Fokus Live"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* QUICK MATCH TABS if there are multiple LIVE matches */}
              {liveMatches.length > 1 && (
                <div className="flex items-center space-x-2 overflow-x-auto pb-1 relative z-10">
                  <span className="text-[11px] font-bold text-red-400 uppercase mr-1 flex items-center space-x-1 shrink-0">
                    <Flame className="w-3.5 h-3.5 text-red-500 animate-pulse" />
                    <span>Laga Sedang Live:</span>
                  </span>
                  {liveMatches.map(lm => (
                    <button
                      key={lm.id}
                      type="button"
                      onClick={() => setFocusedMatchId(lm.id)}
                      className={`px-3 py-1 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer shrink-0 ${
                        currentFocusedMatch.id === lm.id
                          ? 'bg-red-600 text-white shadow-lg shadow-red-950 font-black'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                      }`}
                    >
                      <span>#{lm.matchNumber}</span>
                      <span>{lm.teamA.name}</span>
                      <span className="text-amber-300 font-mono font-black">
                        {lm.teamA.score ?? 0} - {lm.teamB.score ?? 0}
                      </span>
                      <span>{lm.teamB.name}</span>
                      {lm.liveMinute && <span className="text-[10px] text-red-200">({lm.liveMinute})</span>}
                    </button>
                  ))}
                </div>
              )}

              {/* GIANT SCOREBOARD INTERFACE */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-center relative z-10">
                {/* TEAM A (5 cols) */}
                <div className="lg:col-span-5 bg-slate-950/80 border border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col items-center text-center space-y-3 shadow-inner">
                  <div className="flex items-center space-x-3 w-full justify-center">
                    {currentFocusedMatch.teamA.logo ? (
                      <img loading="lazy"
                        src={currentFocusedMatch.teamA.logo}
                        alt={currentFocusedMatch.teamA.name}
                        className="w-12 h-12 rounded-xl object-contain bg-slate-900 p-1 border border-slate-800 shadow shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500 shrink-0">
                        <Shield className="w-6 h-6 text-red-500" />
                      </div>
                    )}
                    <div className="text-left">
                      <span className="px-2 py-0.5 rounded bg-red-950 text-red-400 font-bold text-[10px] uppercase tracking-wider">
                        TIM A (HOME)
                      </span>
                      <h4 className="text-lg sm:text-xl font-black text-white line-clamp-1 mt-0.5">
                        {currentFocusedMatch.teamA.name}
                      </h4>
                      {currentFocusedMatch.teamA.institution && (
                        <p className="text-[11px] text-slate-400 line-clamp-1">
                          {currentFocusedMatch.teamA.institution}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* GIANT SCORE CONTROLLER */}
                  <div className="w-full pt-2 flex items-center justify-center space-x-3">
                    <button
                      type="button"
                      onClick={() =>
                        handleUpdateField(
                          currentFocusedMatch.id,
                          'scoreA',
                          Math.max(0, (focusedState.scoreA ?? 0) - 1),
                          currentFocusedMatch
                        )
                      }
                      className="w-12 h-12 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-black text-2xl flex items-center justify-center transition active:scale-90 cursor-pointer shadow-lg border border-slate-700 select-none"
                      title="Kurangi Gol (-1)"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min={0}
                      value={focusedState.scoreA ?? 0}
                      onChange={e =>
                        handleUpdateField(
                          currentFocusedMatch.id,
                          'scoreA',
                          Math.max(0, Number(e.target.value) || 0),
                          currentFocusedMatch
                        )
                      }
                      className="w-24 sm:w-28 text-center font-mono font-black text-5xl sm:text-6xl text-amber-400 bg-slate-900 border-2 border-amber-500/40 focus:border-amber-400 rounded-2xl py-2 shadow-2xl focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        handleUpdateField(
                          currentFocusedMatch.id,
                          'scoreA',
                          (focusedState.scoreA ?? 0) + 1,
                          currentFocusedMatch
                        )
                      }
                      className="w-12 h-12 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-black text-2xl flex items-center justify-center transition active:scale-90 cursor-pointer shadow-lg shadow-red-600/30 border border-red-500 select-none"
                      title="Tambah Gol (+1)"
                    >
                      +
                    </button>
                  </div>

                  {/* Quick Event Buttons for Team A */}
                  <div className="w-full grid grid-cols-3 gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => handleOpenEventModal(currentFocusedMatch, 'GOAL', 'A')}
                      className="py-1.5 px-2 rounded-xl bg-emerald-950/90 hover:bg-emerald-900 text-emerald-300 border border-emerald-700/60 font-bold text-xs transition flex items-center justify-center space-x-1 cursor-pointer"
                    >
                      <span>⚽</span>
                      <span>+ Gol</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenEventModal(currentFocusedMatch, 'YELLOW', 'A')}
                      className="py-1.5 px-2 rounded-xl bg-yellow-950/90 hover:bg-yellow-900 text-yellow-300 border border-yellow-700/60 font-bold text-xs transition flex items-center justify-center space-x-1 cursor-pointer"
                    >
                      <span>🟨</span>
                      <span>+ KK</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenEventModal(currentFocusedMatch, 'RED', 'A')}
                      className="py-1.5 px-2 rounded-xl bg-red-950/90 hover:bg-red-900 text-red-300 border border-red-700/60 font-bold text-xs transition flex items-center justify-center space-x-1 cursor-pointer"
                    >
                      <span>🟥</span>
                      <span>+ KM</span>
                    </button>
                  </div>
                </div>

                {/* CENTER CONTROLS (2 cols) */}
                <div className="lg:col-span-2 flex flex-col items-center justify-center space-y-3 text-center">
                  {/* Status Live Indicator */}
                  <div className="w-full">
                    <span
                      className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-black tracking-wider uppercase border ${
                        isLiveNow
                          ? 'bg-red-600 text-white border-red-400 shadow-lg shadow-red-600/30 animate-pulse'
                          : focusedState.status === 'FINISHED'
                          ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                          : 'bg-slate-800 text-slate-300 border-slate-700'
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          isLiveNow ? 'bg-white animate-ping' : 'bg-slate-400'
                        }`}
                      />
                      <span>{focusedState.status}</span>
                    </span>
                  </div>

                  {/* Menit Pertandingan Input & Quick Chips */}
                  <div className="w-full bg-slate-950/80 p-3 rounded-2xl border border-slate-800 space-y-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Menit Pertandingan
                    </span>
                    <input
                      type="text"
                      placeholder="Contoh: 15'"
                      value={focusedState.liveMinute}
                      onChange={e =>
                        handleUpdateField(
                          currentFocusedMatch.id,
                          'liveMinute',
                          e.target.value,
                          currentFocusedMatch
                        )
                      }
                      className="w-full text-center font-mono font-bold text-sm bg-slate-900 border border-slate-700 rounded-xl py-1 text-red-400 placeholder-slate-600 focus:outline-none focus:border-red-500"
                    />
                    {/* Quick minute presets */}
                    <div className="flex flex-wrap items-center justify-center gap-1 pt-1">
                      {["1'", "10'", "20'", 'HT', "25'", "35'", "40'", 'FT'].map(mStr => (
                        <button
                          key={mStr}
                          type="button"
                          onClick={() =>
                            handleUpdateField(
                              currentFocusedMatch.id,
                              'liveMinute',
                              mStr,
                              currentFocusedMatch
                            )
                          }
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold transition cursor-pointer ${
                            focusedState.liveMinute === mStr
                              ? 'bg-red-600 text-white'
                              : 'bg-slate-900 hover:bg-slate-800 text-slate-400 border border-slate-800'
                          }`}
                        >
                          {mStr}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Quick 1-Click Match Status Changer */}
                  <div className="w-full grid grid-cols-2 gap-1 text-[10px] font-bold">
                    <button
                      type="button"
                      onClick={() => {
                        handleUpdateField(currentFocusedMatch.id, 'status', 'LIVE', currentFocusedMatch);
                        if (!focusedState.liveMinute || focusedState.liveMinute === 'FT' || focusedState.liveMinute === 'HT') {
                          handleUpdateField(currentFocusedMatch.id, 'liveMinute', "1'", currentFocusedMatch);
                        }
                      }}
                      className={`py-1.5 px-2 rounded-xl transition cursor-pointer flex items-center justify-center space-x-1 ${
                        focusedState.status === 'LIVE' && focusedState.liveMinute !== 'HT'
                          ? 'bg-red-600 text-white font-black shadow'
                          : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
                      }`}
                    >
                      <span>🔴 LIVE</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        handleUpdateField(
                          currentFocusedMatch.id,
                          'status',
                          'LIVE',
                          currentFocusedMatch
                        );
                        handleUpdateField(currentFocusedMatch.id, 'liveMinute', 'HT', currentFocusedMatch);
                      }}
                      className={`py-1.5 px-2 rounded-xl transition cursor-pointer flex items-center justify-center space-x-1 ${
                        focusedState.status === 'LIVE' && focusedState.liveMinute === 'HT'
                          ? 'bg-amber-600 text-white font-black shadow'
                          : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
                      }`}
                    >
                      <span>⏸️ HT (JEDA)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        handleUpdateField(
                          currentFocusedMatch.id,
                          'status',
                          'FINISHED',
                          currentFocusedMatch
                        );
                        handleUpdateField(currentFocusedMatch.id, 'liveMinute', 'FT', currentFocusedMatch);
                      }}
                      className={`py-1.5 px-2 rounded-xl transition cursor-pointer flex items-center justify-center space-x-1 ${
                        focusedState.status === 'FINISHED'
                          ? 'bg-emerald-600 text-white font-black shadow'
                          : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
                      }`}
                    >
                      <span>🏁 FINISHED</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        handleUpdateField(
                          currentFocusedMatch.id,
                          'status',
                          'UPCOMING',
                          currentFocusedMatch
                        );
                        handleUpdateField(currentFocusedMatch.id, 'liveMinute', '', currentFocusedMatch);
                      }}
                      className={`py-1.5 px-2 rounded-xl transition cursor-pointer flex items-center justify-center space-x-1 ${
                        focusedState.status === 'UPCOMING'
                          ? 'bg-blue-600 text-white font-black shadow'
                          : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
                      }`}
                    >
                      <span>⏳ UPCOMING</span>
                    </button>
                  </div>
                </div>

                {/* TEAM B (5 cols) */}
                <div className="lg:col-span-5 bg-slate-950/80 border border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col items-center text-center space-y-3 shadow-inner">
                  <div className="flex items-center space-x-3 w-full justify-center">
                    <div className="text-right">
                      <span className="px-2 py-0.5 rounded bg-blue-950 text-blue-400 font-bold text-[10px] uppercase tracking-wider">
                        TIM B (AWAY)
                      </span>
                      <h4 className="text-lg sm:text-xl font-black text-white line-clamp-1 mt-0.5">
                        {currentFocusedMatch.teamB.name}
                      </h4>
                      {currentFocusedMatch.teamB.institution && (
                        <p className="text-[11px] text-slate-400 line-clamp-1">
                          {currentFocusedMatch.teamB.institution}
                        </p>
                      )}
                    </div>
                    {currentFocusedMatch.teamB.logo ? (
                      <img loading="lazy"
                        src={currentFocusedMatch.teamB.logo}
                        alt={currentFocusedMatch.teamB.name}
                        className="w-12 h-12 rounded-xl object-contain bg-slate-900 p-1 border border-slate-800 shadow shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500 shrink-0">
                        <Shield className="w-6 h-6 text-blue-500" />
                      </div>
                    )}
                  </div>

                  {/* GIANT SCORE CONTROLLER */}
                  <div className="w-full pt-2 flex items-center justify-center space-x-3">
                    <button
                      type="button"
                      onClick={() =>
                        handleUpdateField(
                          currentFocusedMatch.id,
                          'scoreB',
                          Math.max(0, (focusedState.scoreB ?? 0) - 1),
                          currentFocusedMatch
                        )
                      }
                      className="w-12 h-12 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-black text-2xl flex items-center justify-center transition active:scale-90 cursor-pointer shadow-lg border border-slate-700 select-none"
                      title="Kurangi Gol (-1)"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min={0}
                      value={focusedState.scoreB ?? 0}
                      onChange={e =>
                        handleUpdateField(
                          currentFocusedMatch.id,
                          'scoreB',
                          Math.max(0, Number(e.target.value) || 0),
                          currentFocusedMatch
                        )
                      }
                      className="w-24 sm:w-28 text-center font-mono font-black text-5xl sm:text-6xl text-amber-400 bg-slate-900 border-2 border-amber-500/40 focus:border-amber-400 rounded-2xl py-2 shadow-2xl focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        handleUpdateField(
                          currentFocusedMatch.id,
                          'scoreB',
                          (focusedState.scoreB ?? 0) + 1,
                          currentFocusedMatch
                        )
                      }
                      className="w-12 h-12 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-black text-2xl flex items-center justify-center transition active:scale-90 cursor-pointer shadow-lg shadow-red-600/30 border border-red-500 select-none"
                      title="Tambah Gol (+1)"
                    >
                      +
                    </button>
                  </div>

                  {/* Quick Event Buttons for Team B */}
                  <div className="w-full grid grid-cols-3 gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => handleOpenEventModal(currentFocusedMatch, 'GOAL', 'B')}
                      className="py-1.5 px-2 rounded-xl bg-emerald-950/90 hover:bg-emerald-900 text-emerald-300 border border-emerald-700/60 font-bold text-xs transition flex items-center justify-center space-x-1 cursor-pointer"
                    >
                      <span>⚽</span>
                      <span>+ Gol</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenEventModal(currentFocusedMatch, 'YELLOW', 'B')}
                      className="py-1.5 px-2 rounded-xl bg-yellow-950/90 hover:bg-yellow-900 text-yellow-300 border border-yellow-700/60 font-bold text-xs transition flex items-center justify-center space-x-1 cursor-pointer"
                    >
                      <span>🟨</span>
                      <span>+ KK</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenEventModal(currentFocusedMatch, 'RED', 'B')}
                      className="py-1.5 px-2 rounded-xl bg-red-950/90 hover:bg-red-900 text-red-300 border border-red-700/60 font-bold text-xs transition flex items-center justify-center space-x-1 cursor-pointer"
                    >
                      <span>🟥</span>
                      <span>+ KM</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* EVENT TIMELINE STRIP FOR FOCUSED MATCH */}
              <div className="bg-slate-950/70 border border-slate-800/90 rounded-2xl p-3.5 space-y-2 relative z-10">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
                    <Activity className="w-3.5 h-3.5 text-red-400" />
                    <span>
                      Riwayat Gol &amp; Kartu Pertandingan Ini ({focusedState.events?.length || 0})
                    </span>
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Klik tombol &times; pada badge jika salah input
                  </span>
                </div>

                {focusedState.events && focusedState.events.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {focusedState.events.map((ev, evIdx) => (
                      <span
                        key={evIdx}
                        className="px-2.5 py-1 rounded-xl text-xs font-semibold bg-slate-900 border border-slate-700 flex items-center space-x-1.5 shadow-sm"
                      >
                        <span className="text-sm">
                          {ev.type === 'GOAL' ? '⚽' : ev.type === 'YELLOW' ? '🟨' : '🟥'}
                        </span>
                        <span className="text-white font-bold">{ev.playerName}</span>
                        {ev.minute && <span className="text-red-400 font-mono">({ev.minute})</span>}
                        <span className="text-slate-400 text-[11px]">
                          [{ev.team === 'A' ? currentFocusedMatch.teamA.name : currentFocusedMatch.teamB.name}]
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveEvent(currentFocusedMatch, evIdx)}
                          className="text-slate-500 hover:text-red-400 ml-1 cursor-pointer font-bold"
                          title="Hapus Catatan"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 italic">
                    Belum ada gol atau kartu dicatat pada laga ini. Klik tombol "+ Gol", "+ KK", atau "+ KM" di atas untuk mencatat.
                  </p>
                )}
              </div>

              {/* FOOTER ACTION: BIG SAVE BUTTON */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-800 relative z-10">
                <div className="text-xs text-slate-400 flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Skor dan pencetak gol otomatis terhubung ke klasemen grup dan top scorer publik.</span>
                </div>

                <div className="flex items-center space-x-3 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => handleSaveLiveMatch(currentFocusedMatch)}
                    disabled={isSavingFocused}
                    className="w-full sm:w-auto px-6 py-3 rounded-xl bg-gradient-to-r from-red-600 via-red-500 to-amber-500 hover:from-red-500 hover:to-amber-400 text-white font-black text-sm uppercase tracking-wider transition shadow-xl shadow-red-600/40 flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50 active:scale-98"
                  >
                    <Save className={`w-4 h-4 ${isSavingFocused ? 'animate-spin' : ''}`} />
                    <span>{isSavingFocused ? 'Menyimpan & Menghitung...' : '💾 SIMPAN SKOR LIVE & KLASEMEN'}</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })()
      ) : liveMatches.length > 0 && !isFocusPanelOpen ? (
        /* HELPER STRIP WHEN LIVE MATCHES EXIST BUT PANEL IS MINIMIZED */
        <div className="p-3.5 rounded-2xl bg-gradient-to-r from-red-950/60 to-slate-900 border border-red-500/40 flex flex-wrap items-center justify-between gap-3 text-xs shadow-lg animate-fadeIn">
          <div className="flex items-center space-x-2 text-red-200">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
            <Radio className="w-4 h-4 text-red-400" />
            <span>
              <strong>{liveMatches.length} Pertandingan Sedang Berjalan (LIVE):</strong> Panel fokus live sedang disembunyikan.
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => setIsFocusPanelOpen(true)}
              className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition cursor-pointer flex items-center space-x-1.5 border border-slate-700 shadow"
            >
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>Buka Panel Fokus</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setIsStandaloneMode(true);
                if (!focusedMatchId && liveMatches.length > 0) {
                  setFocusedMatchId(liveMatches[0].id);
                }
              }}
              className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white font-bold text-xs transition cursor-pointer flex items-center space-x-1.5 shadow"
              title="Buka Mode Standalone Layar Penuh"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>Mode Standalone</span>
            </button>
          </div>
        </div>
      ) : (
        /* CLEAN MINIMAL STATUS WHEN NO MATCHES ARE LIVE */
        <div className="p-3 rounded-xl bg-slate-900/40 border border-slate-800/60 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-slate-600" />
            <span>
              <strong className="text-slate-300">Mode Fokus Live:</strong> Tidak ada pertandingan yang berstatus <strong>LIVE</strong> saat ini.
            </span>
          </div>
          <span className="text-[11px] text-slate-500 hidden sm:inline">
            Klik tombol &ldquo;▶️ Mulai LIVE&rdquo; pada jadwal di bawah untuk memulai pertandingan.
          </span>
        </div>
      )
    )}

      {/* LIVE FILTER BANNER (When filter is set to LIVE) */}
      {selectedStatus === 'LIVE' && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-red-950/80 via-slate-900 to-slate-900 border border-red-500/50 flex flex-wrap items-center justify-between gap-3 text-xs shadow-lg animate-fadeIn">
          <div className="flex items-center space-x-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping shrink-0" />
            <span className="text-red-300 font-bold">
              Filter Khusus Pertandingan LIVE Aktif:
            </span>
            <span className="text-slate-300">
              Menampilkan {filteredMatches.length} pertandingan yang sedang berjalan. Pertandingan grup yang belum mulai otomatis disembunyikan agar operator dapat fokus.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setSelectedStatus('ALL')}
            className="px-3 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition cursor-pointer"
          >
            Tampilkan Semua Jadwal &amp; Grup
          </button>
        </div>
      )}

      {/* MATCHES LIST */}
      {filteredMatches.length === 0 ? (
        selectedStatus === 'LIVE' ? (
          <div className="p-10 rounded-2xl bg-slate-900 border border-red-500/30 text-center space-y-3">
            <div className="w-12 h-12 rounded-xl bg-red-950/60 border border-red-800/40 flex items-center justify-center mx-auto text-red-400">
              <Radio className="w-6 h-6" />
            </div>
            <h4 className="font-bold text-white text-base">Tidak Ada Pertandingan yang Sedang LIVE</h4>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Saat ini tidak ada pertandingan yang berstatus LIVE pada kategori yang dipilih.
              Jadwal grup yang belum mulai sengaja disembunyikan pada filter live ini agar tampilan tetap bersih.
            </p>
            <div className="pt-2 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedStatus('ALL')}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition cursor-pointer"
              >
                Lihat Semua Jadwal &amp; Grup
              </button>
              <button
                type="button"
                onClick={() => setSelectedStatus('UPCOMING')}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs transition cursor-pointer"
              >
                Lihat Jadwal Belum Mulai
              </button>
            </div>
          </div>
        ) : (
          <div className="p-12 rounded-2xl bg-slate-900 border border-slate-800 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-slate-800 flex items-center justify-center mx-auto text-slate-500">
              <Calendar className="w-7 h-7 text-red-500" />
            </div>
            <div className="space-y-1">
              <h4 className="font-bold text-white text-base">Belum Ada Pertandingan</h4>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Belum ada jadwal pertandingan untuk filter ini.{' '}
                {canFullManageSchedule
                  ? 'Anda dapat mengacak tim di tab "Pembagian Grup" atau klik "Tambah Jadwal Baru".'
                  : 'Silakan tunggu jadwal dirilis oleh Panitia Pelaksana.'}
              </p>
            </div>
          </div>
        )
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {filteredMatches.map(m => {
            const state = getMatchState(m);
            const isSaving = savingMatchId === m.id;
            const isLive = state.status === 'LIVE';

            return (
              <div
                key={m.id}
                className={`p-5 rounded-2xl border transition shadow-xl flex flex-col justify-between space-y-4 ${
                  isLive
                    ? 'bg-gradient-to-br from-slate-900 via-slate-900 to-red-950/40 border-red-500 ring-1 ring-red-500/30'
                    : 'bg-slate-900 border-slate-800'
                }`}
              >
                {/* Match Card Header */}
                <div className="flex items-center justify-between text-xs pb-3 border-b border-slate-800/80">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-red-400">
                      Match #{m.matchNumber}
                    </span>
                    <span className="text-slate-500">•</span>
                    <span className="px-2 py-0.5 rounded bg-slate-950 text-slate-300 font-bold border border-slate-800 text-[10px]">
                      {m.category}
                    </span>
                    {m.group && (
                      <span className="px-2 py-0.5 rounded bg-amber-950/60 text-amber-300 font-bold border border-amber-800/40 text-[10px]">
                        {m.group}
                      </span>
                    )}
                    <span className="text-slate-400 truncate max-w-[120px]">
                      {m.round}
                    </span>
                  </div>

                  {/* Status Dropdown */}
                  <select
                    value={state.status}
                    onChange={e =>
                      handleUpdateField(m.id, 'status', e.target.value as MatchStatus, m)
                    }
                    className={`text-[10px] font-bold rounded-lg px-2.5 py-1 border cursor-pointer ${
                      isLive
                        ? 'bg-red-600 text-white border-red-400 animate-pulse'
                        : state.status === 'FINISHED'
                        ? 'bg-slate-800 text-slate-300 border-slate-700'
                        : 'bg-blue-950 text-blue-300 border-blue-800'
                    }`}
                  >
                    <option value="UPCOMING">UPCOMING</option>
                    <option value="LIVE">🔴 LIVE SEKARANG</option>
                    <option value="FINISHED">FINISHED (SELESAI)</option>
                  </select>
                </div>

                {/* Score Editing Inputs with Min (-) and Plus (+) Buttons */}
                <div className="grid grid-cols-12 items-center gap-2 sm:gap-3 py-2 bg-slate-950/60 p-4 rounded-xl border border-slate-800/80">
                  {/* Team A */}
                  <div className="col-span-5 text-center space-y-2">
                    <p className="font-black text-white text-xs sm:text-sm line-clamp-1" title={m.teamA.name}>
                      {m.teamA.name}
                    </p>
                    <div className="flex items-center justify-center space-x-1 sm:space-x-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          handleUpdateField(
                            m.id,
                            'scoreA',
                            Math.max(0, (state.scoreA ?? 0) - 1),
                            m
                          )
                        }
                        className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-black text-sm sm:text-base flex items-center justify-center transition active:scale-95 cursor-pointer shadow border border-slate-700 select-none"
                        title="Kurangi Skor (-1)"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min={0}
                        value={state.scoreA ?? 0}
                        onChange={e =>
                          handleUpdateField(
                            m.id,
                            'scoreA',
                            Math.max(0, Number(e.target.value) || 0),
                            m
                          )
                        }
                        className="w-12 sm:w-14 text-center font-mono font-black text-lg sm:text-xl text-amber-400 bg-slate-900 border-2 border-slate-700 focus:border-red-500 rounded-xl py-1 shadow-inner"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          handleUpdateField(m.id, 'scoreA', (state.scoreA ?? 0) + 1, m)
                        }
                        className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-red-600 hover:bg-red-500 text-white font-black text-sm sm:text-base flex items-center justify-center transition active:scale-95 cursor-pointer shadow border border-red-500 select-none"
                        title="Tambah Skor (+1)"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* VS / LIVE MINUTE */}
                  <div className="col-span-2 text-center space-y-1">
                    <span className="text-xs font-bold text-slate-500 uppercase block">
                      VS
                    </span>
                    {isLive && (
                      <input
                        type="text"
                        placeholder="Menit"
                        value={state.liveMinute}
                        onChange={e =>
                          handleUpdateField(m.id, 'liveMinute', e.target.value, m)
                        }
                        className="w-12 sm:w-14 mx-auto bg-red-950/60 border border-red-600/50 rounded text-center text-[10px] text-red-300 font-bold"
                        title="Menit pertandingan (contoh: 42')"
                      />
                    )}
                  </div>

                  {/* Team B */}
                  <div className="col-span-5 text-center space-y-2">
                    <p className="font-black text-white text-xs sm:text-sm line-clamp-1" title={m.teamB.name}>
                      {m.teamB.name}
                    </p>
                    <div className="flex items-center justify-center space-x-1 sm:space-x-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          handleUpdateField(
                            m.id,
                            'scoreB',
                            Math.max(0, (state.scoreB ?? 0) - 1),
                            m
                          )
                        }
                        className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-black text-sm sm:text-base flex items-center justify-center transition active:scale-95 cursor-pointer shadow border border-slate-700 select-none"
                        title="Kurangi Skor (-1)"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min={0}
                        value={state.scoreB ?? 0}
                        onChange={e =>
                          handleUpdateField(
                            m.id,
                            'scoreB',
                            Math.max(0, Number(e.target.value) || 0),
                            m
                          )
                        }
                        className="w-12 sm:w-14 text-center font-mono font-black text-lg sm:text-xl text-amber-400 bg-slate-900 border-2 border-slate-700 focus:border-red-500 rounded-xl py-1 shadow-inner"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          handleUpdateField(m.id, 'scoreB', (state.scoreB ?? 0) + 1, m)
                        }
                        className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-red-600 hover:bg-red-500 text-white font-black text-sm sm:text-base flex items-center justify-center transition active:scale-95 cursor-pointer shadow border border-red-500 select-none"
                        title="Tambah Skor (+1)"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>

                {/* Event Logging (Goals & Cards) */}
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-400 gap-1.5">
                    <span className="font-semibold uppercase tracking-wider text-[10px] sm:text-[11px]">
                      Pencatatan Gol &amp; Pelanggaran:
                    </span>
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => handleOpenEventModal(m, 'GOAL')}
                        className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800/60 font-bold hover:bg-emerald-900 transition cursor-pointer text-[10px] sm:text-xs"
                        title="Catat Gol"
                      >
                        + ⚽ Gol
                      </button>
                      <button
                        onClick={() => handleOpenEventModal(m, 'YELLOW')}
                        className="px-2 py-0.5 rounded bg-yellow-950 text-yellow-300 border border-yellow-800/60 font-bold hover:bg-yellow-900 transition cursor-pointer text-[10px] sm:text-xs"
                        title="Catat Kartu Kuning"
                      >
                        + 🟨 Kartu
                      </button>
                      <button
                        onClick={() => handleOpenEventModal(m, 'RED')}
                        className="px-2 py-0.5 rounded bg-red-950 text-red-300 border border-red-800/60 font-bold hover:bg-red-900 transition cursor-pointer text-[10px] sm:text-xs"
                        title="Catat Kartu Merah"
                      >
                        + 🟥 Kartu
                      </button>
                    </div>
                  </div>

                  {/* List of current events */}
                  {state.events && state.events.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 p-2 rounded-xl bg-slate-950 border border-slate-800">
                      {state.events.map((ev, evIdx) => (
                        <span
                          key={evIdx}
                          className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-900 border border-slate-700 flex items-center space-x-1"
                        >
                          <span>{ev.type === 'GOAL' ? '⚽' : ev.type === 'YELLOW' ? '🟨' : '🟥'}</span>
                          <span className="text-white">{ev.playerName}</span>
                          {ev.minute && <span className="text-slate-400">({ev.minute})</span>}
                          <span className="text-slate-500">[{ev.team === 'A' ? m.teamA.name : m.teamB.name}]</span>
                          <button
                            onClick={() => handleRemoveEvent(m, evIdx)}
                            className="text-slate-500 hover:text-red-400 ml-1 cursor-pointer"
                            title="Hapus Catatan"
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[10px] text-slate-500 italic">
                      Belum ada pencetak gol atau kartu dicatat untuk match ini.
                    </p>
                  )}
                </div>

                {/* Match Footer & Actions */}
                <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-3 text-slate-400 text-[11px] gap-0.5 sm:gap-0">
                    <div className="flex items-center space-x-2">
                      <span className="flex items-center space-x-1">
                        <Calendar className="w-3 h-3 text-red-500" />
                        <span>{m.date || 'TBD'}</span>
                      </span>
                      <span className="flex items-center space-x-1">
                        <Clock className="w-3 h-3 text-red-500" />
                        <span>{m.time ? `${m.time} WIB` : 'TBD'}</span>
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-500 truncate max-w-[180px]">
                      📍 {m.pitch || DEFAULT_PITCH}
                    </span>
                  </div>

                  <div className="flex items-center space-x-2">
                    {/* Tombol Edit Jadwal Lengkap (Khusus Super Admin, Panitia Inti, Panitia Umum) */}
                    {canFullManageSchedule && (
                      <button
                        onClick={() => handleOpenEditMatch(m)}
                        className="p-2 rounded-xl bg-slate-800 hover:bg-blue-950 text-slate-300 hover:text-blue-400 border border-slate-700 transition cursor-pointer"
                        title="Edit Jadwal Pertandingan Lengkap"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {/* Tombol Hapus Pertandingan (Khusus Super Admin, Panitia Inti, Panitia Umum) */}
                    {canFullManageSchedule && (
                      <button
                        onClick={() => {
                          if (confirm(`Hapus Match #${m.matchNumber} (${m.teamA.name} vs ${m.teamB.name})?`)) {
                            deleteMatch(m.id);
                          }
                        }}
                        className="p-2 rounded-xl bg-slate-800 hover:bg-red-950 text-slate-400 hover:text-red-400 border border-slate-700 transition cursor-pointer"
                        title="Hapus Pertandingan"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {/* Tombol Fokus Live Match (hanya untuk status LIVE) atau Mulai LIVE (untuk UPCOMING) */}
                    {m.status === 'LIVE' ? (
                      <div className="flex items-center space-x-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setFocusedMatchId(m.id);
                            setIsFocusPanelOpen(true);
                            setSelectedStatus('LIVE');
                            if (selectedGroup !== 'ALL') {
                              setSelectedGroup('ALL');
                            }
                            window.scrollTo({ top: 180, behavior: 'smooth' });
                          }}
                          className="px-3 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black text-xs transition flex items-center space-x-1.5 cursor-pointer shadow-md shadow-red-950/40 animate-pulse"
                          title="Fokuskan laga yang sedang LIVE ini ke panel operator di atas"
                        >
                          <Zap className="w-3.5 h-3.5 text-amber-300" />
                          <span>Fokus Live</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setFocusedMatchId(m.id);
                            setIsStandaloneMode(true);
                          }}
                          className="p-2 rounded-xl bg-amber-600/20 hover:bg-amber-600 text-amber-300 hover:text-white border border-amber-500/40 transition cursor-pointer"
                          title="Buka Langsung di Mode Standalone Operator (Layar Penuh)"
                        >
                          <Maximize2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : m.status === 'UPCOMING' ? (
                      <button
                        type="button"
                        onClick={async () => {
                          handleUpdateField(m.id, 'status', 'LIVE', m);
                          handleUpdateField(m.id, 'liveMinute', "1'", m);
                          setSavingMatchId(m.id);
                          try {
                            await updateMatchLiveScore(
                              m.id,
                              m.teamA.score ?? 0,
                              m.teamB.score ?? 0,
                              'LIVE',
                              "1'",
                              m.events || []
                            );
                            setFocusedMatchId(m.id);
                            setIsFocusPanelOpen(true);
                            setSelectedStatus('LIVE');
                            window.scrollTo({ top: 180, behavior: 'smooth' });
                          } catch (err: any) {
                            alert(`Gagal memulai LIVE: ${err?.message || 'Error'}`);
                          } finally {
                            setSavingMatchId(null);
                          }
                        }}
                        className="px-2.5 py-2 rounded-xl bg-red-600/20 hover:bg-red-600/30 text-red-300 hover:text-red-200 border border-red-500/40 font-bold text-xs transition flex items-center space-x-1.5 cursor-pointer"
                        title="Mulai kickoff pertandingan dan buka di panel fokus live"
                      >
                        <Radio className="w-3.5 h-3.5 text-red-400" />
                        <span>Mulai LIVE</span>
                      </button>
                    ) : null}

                    {/* Tombol Simpan & Hitung Klasemen (Dapat diakses Wasit, Live Score, & Admin) */}
                    <button
                      onClick={() => handleSaveLiveMatch(m)}
                      disabled={isSaving}
                      className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white font-bold text-xs transition flex items-center space-x-1.5 shadow-md shadow-red-950/40 cursor-pointer disabled:opacity-50"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>{isSaving ? 'Menyimpan...' : 'Simpan & Hitung'}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 🖥️ STANDALONE OPERATOR LIVE SCORE CONSOLE (FULLSCREEN DEDICATED WORKSPACE) */}
      {/* ========================================================================= */}
      {isStandaloneMode && (
        <div className="fixed inset-0 z-[60] bg-[#070b13] text-white overflow-y-auto flex flex-col animate-fadeIn select-none">
          {/* Glow background accents */}
          <div className="fixed top-0 left-1/4 w-[600px] h-[300px] bg-red-600/10 blur-[120px] pointer-events-none rounded-full" />
          <div className="fixed bottom-0 right-1/4 w-[600px] h-[300px] bg-amber-500/10 blur-[120px] pointer-events-none rounded-full" />

          {/* TOP BAR: STANDALONE HEADER */}
          <header className="sticky top-0 z-20 bg-slate-950/90 backdrop-blur-md border-b border-slate-800 px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3 shadow-xl">
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-red-600 text-white font-black text-xs uppercase tracking-wider shadow-lg shadow-red-900/40">
                <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping mr-0.5" />
                <Radio className="w-4 h-4" />
                <span>KONSOL OPERATOR STANDALONE</span>
              </div>

              {activeStandaloneMatch && (
                <div className="hidden md:flex items-center space-x-2 text-xs">
                  <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-200 font-bold border border-slate-700">
                    Match #{activeStandaloneMatch.matchNumber}
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-red-950 text-red-300 font-bold border border-red-800/60">
                    {activeStandaloneMatch.category}
                  </span>
                  {activeStandaloneMatch.group && (
                    <span className="px-2.5 py-1 rounded-lg bg-amber-950 text-amber-300 font-bold border border-amber-800/60">
                      {activeStandaloneMatch.group}
                    </span>
                  )}
                  <span className="text-slate-400 font-medium">
                    {activeStandaloneMatch.round}
                  </span>
                </div>
              )}
            </div>

            {/* MATCH SELECTOR & STANDALONE CONTROLS */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Match selector dropdown */}
              <div className="flex items-center space-x-1.5">
                <span className="text-[11px] text-slate-400 hidden lg:inline font-semibold">Pilih Laga:</span>
                <select
                  value={activeStandaloneMatch?.id || ''}
                  onChange={e => setFocusedMatchId(e.target.value)}
                  className="bg-slate-900 border border-slate-700 hover:border-slate-600 text-white text-xs font-bold rounded-xl px-3 py-2 focus:outline-none focus:border-red-500 cursor-pointer shadow-inner max-w-[240px] sm:max-w-xs md:max-w-sm truncate"
                >
                  {matches.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.status === 'LIVE' ? '🔴 LIVE' : m.status === 'FINISHED' ? '🏁 FINISHED' : '⏳ UPCOMING'} #{m.matchNumber} [{m.category}] {m.teamA.name} {m.teamA.score ?? 0} - {m.teamB.score ?? 0} {m.teamB.name} {m.liveMinute ? `(${m.liveMinute})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Sync Server button */}
              <button
                type="button"
                onClick={handleRefreshMatches}
                disabled={isRefreshingMatches || isSyncingWithServer}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs transition cursor-pointer disabled:opacity-50"
                title="Sinkronisasi dengan server database"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${(isRefreshingMatches || isSyncingWithServer) ? 'animate-spin text-cyan-400' : ''}`} />
              </button>

              {/* Browser Fullscreen toggle button */}
              <button
                type="button"
                onClick={() => {
                  if (!document.fullscreenElement) {
                    document.documentElement.requestFullscreen().catch(() => {});
                  } else {
                    if (document.exitFullscreen) {
                      document.exitFullscreen().catch(() => {});
                    }
                  }
                }}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs transition cursor-pointer hidden sm:flex"
                title="Layar Penuh Monitor"
              >
                <Monitor className="w-3.5 h-3.5" />
              </button>

              {/* Keluar Mode Standalone */}
              <button
                type="button"
                onClick={() => setIsStandaloneMode(false)}
                className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-white text-xs font-black transition flex items-center space-x-1.5 cursor-pointer shadow-lg shadow-red-950/40 active:scale-95"
                title="Keluar dari Konsol Standalone (ESC)"
              >
                <Minimize2 className="w-3.5 h-3.5" />
                <span>Keluar Standalone</span>
                <kbd className="hidden sm:inline px-1.5 py-0.2 rounded bg-black/40 text-[9px] font-mono border border-white/20">ESC</kbd>
              </button>
            </div>
          </header>

          {/* STANDALONE CONTENT */}
          <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col justify-start relative z-10 space-y-6">
            {activeStandaloneMatch ? (
              (() => {
                const focusedState = getMatchState(activeStandaloneMatch);
                const isSavingFocused = savingMatchId === activeStandaloneMatch.id;
                const isLiveNow = focusedState.status === 'LIVE';

                return (
                  <div className="rounded-3xl border-2 border-red-500/80 bg-gradient-to-b from-slate-900 via-slate-900 to-[#0b1120] shadow-2xl shadow-red-950/50 p-5 md:p-8 space-y-6 relative overflow-hidden animate-fadeIn">
                    {/* Laga info strip */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-3 py-1 rounded-xl bg-red-600/20 border border-red-500/60 text-red-400 font-bold text-xs">
                          Match #{activeStandaloneMatch.matchNumber}
                        </span>
                        <span className="px-3 py-1 rounded-xl bg-red-950 text-red-300 font-bold text-xs border border-red-800/60">
                          {activeStandaloneMatch.category}
                        </span>
                        {activeStandaloneMatch.group && (
                          <span className="px-3 py-1 rounded-xl bg-amber-950 text-amber-300 font-bold text-xs border border-amber-800/60">
                            {activeStandaloneMatch.group}
                          </span>
                        )}
                        <span className="text-xs text-slate-300 font-semibold">
                          {activeStandaloneMatch.round}
                        </span>
                      </div>

                      <div className="flex items-center space-x-4 text-xs text-slate-400">
                        <span className="flex items-center space-x-1">
                          <Calendar className="w-3.5 h-3.5 text-red-400" />
                          <span>{activeStandaloneMatch.date || 'TBD'}</span>
                        </span>
                        <span className="flex items-center space-x-1">
                          <Clock className="w-3.5 h-3.5 text-red-400" />
                          <span>{activeStandaloneMatch.time ? `${activeStandaloneMatch.time} WIB` : 'TBD'}</span>
                        </span>
                        <span className="hidden sm:inline text-slate-500">
                          📍 {activeStandaloneMatch.pitch || DEFAULT_PITCH}
                        </span>
                      </div>
                    </div>

                    {/* GIANT SCOREBOARD INTERFACE */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-center">
                      {/* TEAM A */}
                      <div className="lg:col-span-5 bg-slate-950/80 border border-slate-800 rounded-3xl p-5 sm:p-6 flex flex-col items-center text-center space-y-4 shadow-inner">
                        <div className="flex items-center space-x-3 w-full justify-center">
                          {activeStandaloneMatch.teamA.logo ? (
                            <img loading="lazy"
                              src={activeStandaloneMatch.teamA.logo}
                              alt={activeStandaloneMatch.teamA.name}
                              className="w-14 h-14 rounded-2xl object-contain bg-slate-900 p-1 border border-slate-800 shadow shrink-0"
                            />
                          ) : (
                            <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500 shrink-0">
                              <Shield className="w-8 h-8 text-red-500" />
                            </div>
                          )}
                          <div className="text-left">
                            <span className="px-2.5 py-0.5 rounded bg-red-950 text-red-400 font-bold text-[10px] uppercase tracking-wider">
                              TIM A (HOME)
                            </span>
                            <h4 className="text-xl sm:text-2xl font-black text-white line-clamp-1 mt-0.5">
                              {activeStandaloneMatch.teamA.name}
                            </h4>
                            {activeStandaloneMatch.teamA.institution && (
                              <p className="text-xs text-slate-400 line-clamp-1">
                                {activeStandaloneMatch.teamA.institution}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* GIANT SCORE CONTROLLER */}
                        <div className="w-full pt-2 flex items-center justify-center space-x-4">
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateField(
                                activeStandaloneMatch.id,
                                'scoreA',
                                Math.max(0, (focusedState.scoreA ?? 0) - 1),
                                activeStandaloneMatch
                              )
                            }
                            className="w-14 h-14 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-black text-3xl flex items-center justify-center transition active:scale-90 cursor-pointer shadow-lg border border-slate-700 select-none"
                            title="Kurangi Gol (-1)"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min={0}
                            value={focusedState.scoreA ?? 0}
                            onChange={e =>
                              handleUpdateField(
                                activeStandaloneMatch.id,
                                'scoreA',
                                Math.max(0, Number(e.target.value) || 0),
                                activeStandaloneMatch
                              )
                            }
                            className="w-28 sm:w-32 text-center font-mono font-black text-5xl sm:text-6xl text-amber-400 bg-slate-900 border-2 border-amber-500/40 focus:border-amber-400 rounded-3xl py-2 shadow-2xl focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateField(
                                activeStandaloneMatch.id,
                                'scoreA',
                                (focusedState.scoreA ?? 0) + 1,
                                activeStandaloneMatch
                              )
                            }
                            className="w-14 h-14 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-black text-3xl flex items-center justify-center transition active:scale-90 cursor-pointer shadow-lg shadow-red-600/30 border border-red-500 select-none"
                            title="Tambah Gol (+1)"
                          >
                            +
                          </button>
                        </div>

                        {/* Quick Event Buttons for Team A */}
                        <div className="w-full grid grid-cols-3 gap-2 pt-2">
                          <button
                            type="button"
                            onClick={() => handleOpenEventModal(activeStandaloneMatch, 'GOAL', 'A')}
                            className="py-2 px-2 rounded-xl bg-emerald-950/90 hover:bg-emerald-900 text-emerald-300 border border-emerald-700/60 font-bold text-xs transition flex items-center justify-center space-x-1 cursor-pointer shadow active:scale-95"
                          >
                            <span>⚽</span>
                            <span>+ Gol</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenEventModal(activeStandaloneMatch, 'YELLOW', 'A')}
                            className="py-2 px-2 rounded-xl bg-yellow-950/90 hover:bg-yellow-900 text-yellow-300 border border-yellow-700/60 font-bold text-xs transition flex items-center justify-center space-x-1 cursor-pointer shadow active:scale-95"
                          >
                            <span>🟨</span>
                            <span>+ KK</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenEventModal(activeStandaloneMatch, 'RED', 'A')}
                            className="py-2 px-2 rounded-xl bg-red-950/90 hover:bg-red-900 text-red-300 border border-red-700/60 font-bold text-xs transition flex items-center justify-center space-x-1 cursor-pointer shadow active:scale-95"
                          >
                            <span>🟥</span>
                            <span>+ KM</span>
                          </button>
                        </div>
                      </div>

                      {/* CENTER CONTROLS */}
                      <div className="lg:col-span-2 flex flex-col items-center justify-center space-y-4 text-center">
                        <div className="w-full">
                          <span
                            className={`inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-full text-xs font-black tracking-wider uppercase border ${
                              isLiveNow
                                ? 'bg-red-600 text-white border-red-400 shadow-lg shadow-red-600/30 animate-pulse'
                                : focusedState.status === 'FINISHED'
                                ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                                : 'bg-slate-800 text-slate-300 border-slate-700'
                            }`}
                          >
                            <span
                              className={`w-2.5 h-2.5 rounded-full ${
                                isLiveNow ? 'bg-white animate-ping' : 'bg-slate-400'
                              }`}
                            />
                            <span>{focusedState.status}</span>
                          </span>
                        </div>

                        {/* Menit Pertandingan Input & Quick Chips */}
                        <div className="w-full bg-slate-950/80 p-3.5 rounded-2xl border border-slate-800 space-y-2.5">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                            Menit Pertandingan
                          </span>
                          <input
                            type="text"
                            placeholder="Contoh: 15'"
                            value={focusedState.liveMinute}
                            onChange={e =>
                              handleUpdateField(
                                activeStandaloneMatch.id,
                                'liveMinute',
                                e.target.value,
                                activeStandaloneMatch
                              )
                            }
                            className="w-full text-center font-mono font-bold text-base bg-slate-900 border border-slate-700 rounded-xl py-1.5 text-red-400 placeholder-slate-600 focus:outline-none focus:border-red-500"
                          />

                          {/* Quick +1' +2' +5' minute steppers */}
                          <div className="grid grid-cols-3 gap-1">
                            {[1, 2, 5].map(step => (
                              <button
                                key={step}
                                type="button"
                                onClick={() => {
                                  const cur = (focusedState.liveMinute || "1'").replace(/\D/g, '');
                                  const num = parseInt(cur, 10);
                                  const next = isNaN(num) ? step : num + step;
                                  handleUpdateField(activeStandaloneMatch.id, 'liveMinute', `${next}'`, activeStandaloneMatch);
                                }}
                                className="py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono font-bold text-[10px] border border-slate-700 transition cursor-pointer active:scale-95"
                                title={`Tambah ${step} Menit`}
                              >
                                +{step}&apos;
                              </button>
                            ))}
                          </div>

                          {/* Quick minute presets */}
                          <div className="flex flex-wrap items-center justify-center gap-1 pt-1">
                            {["1'", "10'", "20'", 'HT', "25'", "35'", "40'", 'FT'].map(mStr => (
                              <button
                                key={mStr}
                                type="button"
                                onClick={() =>
                                  handleUpdateField(
                                    activeStandaloneMatch.id,
                                    'liveMinute',
                                    mStr,
                                    activeStandaloneMatch
                                  )
                                }
                                className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold transition cursor-pointer ${
                                  focusedState.liveMinute === mStr
                                    ? 'bg-red-600 text-white'
                                    : 'bg-slate-900 hover:bg-slate-800 text-slate-400 border border-slate-800'
                                }`}
                              >
                                {mStr}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* 1-Click Match Status Changer */}
                        <div className="w-full grid grid-cols-2 gap-1.5 text-[10px] font-bold">
                          <button
                            type="button"
                            onClick={() => {
                              handleUpdateField(activeStandaloneMatch.id, 'status', 'LIVE', activeStandaloneMatch);
                              if (!focusedState.liveMinute || focusedState.liveMinute === 'FT' || focusedState.liveMinute === 'HT') {
                                handleUpdateField(activeStandaloneMatch.id, 'liveMinute', "1'", activeStandaloneMatch);
                              }
                            }}
                            className={`py-2 px-2 rounded-xl transition cursor-pointer flex items-center justify-center space-x-1 ${
                              focusedState.status === 'LIVE' && focusedState.liveMinute !== 'HT'
                                ? 'bg-red-600 text-white font-black shadow'
                                : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
                            }`}
                          >
                            <span>🔴 LIVE</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              handleUpdateField(activeStandaloneMatch.id, 'status', 'LIVE', activeStandaloneMatch);
                              handleUpdateField(activeStandaloneMatch.id, 'liveMinute', 'HT', activeStandaloneMatch);
                            }}
                            className={`py-2 px-2 rounded-xl transition cursor-pointer flex items-center justify-center space-x-1 ${
                              focusedState.status === 'LIVE' && focusedState.liveMinute === 'HT'
                                ? 'bg-amber-600 text-white font-black shadow'
                                : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
                            }`}
                          >
                            <span>⏸️ HT (JEDA)</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              handleUpdateField(activeStandaloneMatch.id, 'status', 'FINISHED', activeStandaloneMatch);
                              handleUpdateField(activeStandaloneMatch.id, 'liveMinute', 'FT', activeStandaloneMatch);
                            }}
                            className={`py-2 px-2 rounded-xl transition cursor-pointer flex items-center justify-center space-x-1 ${
                              focusedState.status === 'FINISHED'
                                ? 'bg-emerald-600 text-white font-black shadow'
                                : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
                            }`}
                          >
                            <span>🏁 FINISHED</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              handleUpdateField(activeStandaloneMatch.id, 'status', 'UPCOMING', activeStandaloneMatch);
                              handleUpdateField(activeStandaloneMatch.id, 'liveMinute', '', activeStandaloneMatch);
                            }}
                            className={`py-2 px-2 rounded-xl transition cursor-pointer flex items-center justify-center space-x-1 ${
                              focusedState.status === 'UPCOMING'
                                ? 'bg-blue-600 text-white font-black shadow'
                                : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
                            }`}
                          >
                            <span>⏳ UPCOMING</span>
                          </button>
                        </div>
                      </div>

                      {/* TEAM B */}
                      <div className="lg:col-span-5 bg-slate-950/80 border border-slate-800 rounded-3xl p-5 sm:p-6 flex flex-col items-center text-center space-y-4 shadow-inner">
                        <div className="flex items-center space-x-3 w-full justify-center">
                          <div className="text-right">
                            <span className="px-2.5 py-0.5 rounded bg-blue-950 text-blue-400 font-bold text-[10px] uppercase tracking-wider">
                              TIM B (AWAY)
                            </span>
                            <h4 className="text-xl sm:text-2xl font-black text-white line-clamp-1 mt-0.5">
                              {activeStandaloneMatch.teamB.name}
                            </h4>
                            {activeStandaloneMatch.teamB.institution && (
                              <p className="text-xs text-slate-400 line-clamp-1">
                                {activeStandaloneMatch.teamB.institution}
                              </p>
                            )}
                          </div>
                          {activeStandaloneMatch.teamB.logo ? (
                            <img loading="lazy"
                              src={activeStandaloneMatch.teamB.logo}
                              alt={activeStandaloneMatch.teamB.name}
                              className="w-14 h-14 rounded-2xl object-contain bg-slate-900 p-1 border border-slate-800 shadow shrink-0"
                            />
                          ) : (
                            <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500 shrink-0">
                              <Shield className="w-8 h-8 text-blue-500" />
                            </div>
                          )}
                        </div>

                        {/* GIANT SCORE CONTROLLER */}
                        <div className="w-full pt-2 flex items-center justify-center space-x-4">
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateField(
                                activeStandaloneMatch.id,
                                'scoreB',
                                Math.max(0, (focusedState.scoreB ?? 0) - 1),
                                activeStandaloneMatch
                              )
                            }
                            className="w-14 h-14 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-black text-3xl flex items-center justify-center transition active:scale-90 cursor-pointer shadow-lg border border-slate-700 select-none"
                            title="Kurangi Gol (-1)"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min={0}
                            value={focusedState.scoreB ?? 0}
                            onChange={e =>
                              handleUpdateField(
                                activeStandaloneMatch.id,
                                'scoreB',
                                Math.max(0, Number(e.target.value) || 0),
                                activeStandaloneMatch
                              )
                            }
                            className="w-28 sm:w-32 text-center font-mono font-black text-5xl sm:text-6xl text-amber-400 bg-slate-900 border-2 border-amber-500/40 focus:border-amber-400 rounded-3xl py-2 shadow-2xl focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateField(
                                activeStandaloneMatch.id,
                                'scoreB',
                                (focusedState.scoreB ?? 0) + 1,
                                activeStandaloneMatch
                              )
                            }
                            className="w-14 h-14 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-black text-3xl flex items-center justify-center transition active:scale-90 cursor-pointer shadow-lg shadow-blue-600/30 border border-blue-500 select-none"
                            title="Tambah Gol (+1)"
                          >
                            +
                          </button>
                        </div>

                        {/* Quick Event Buttons for Team B */}
                        <div className="w-full grid grid-cols-3 gap-2 pt-2">
                          <button
                            type="button"
                            onClick={() => handleOpenEventModal(activeStandaloneMatch, 'GOAL', 'B')}
                            className="py-2 px-2 rounded-xl bg-emerald-950/90 hover:bg-emerald-900 text-emerald-300 border border-emerald-700/60 font-bold text-xs transition flex items-center justify-center space-x-1 cursor-pointer shadow active:scale-95"
                          >
                            <span>⚽</span>
                            <span>+ Gol</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenEventModal(activeStandaloneMatch, 'YELLOW', 'B')}
                            className="py-2 px-2 rounded-xl bg-yellow-950/90 hover:bg-yellow-900 text-yellow-300 border border-yellow-700/60 font-bold text-xs transition flex items-center justify-center space-x-1 cursor-pointer shadow active:scale-95"
                          >
                            <span>🟨</span>
                            <span>+ KK</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenEventModal(activeStandaloneMatch, 'RED', 'B')}
                            className="py-2 px-2 rounded-xl bg-red-950/90 hover:bg-red-900 text-red-300 border border-red-700/60 font-bold text-xs transition flex items-center justify-center space-x-1 cursor-pointer shadow active:scale-95"
                          >
                            <span>🟥</span>
                            <span>+ KM</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* TIMELINE CATATAN GOL & KARTU */}
                    <div className="pt-3 border-t border-slate-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-300 flex items-center space-x-1.5">
                          <Activity className="w-4 h-4 text-red-500" />
                          <span>Catatan Gol &amp; Pelanggaran Laga (Live Events):</span>
                        </span>
                        <span className="text-[11px] text-slate-400">
                          Total: {focusedState.events?.length || 0} catatan
                        </span>
                      </div>

                      {focusedState.events && focusedState.events.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {focusedState.events.map((ev, evIdx) => (
                            <span
                              key={evIdx}
                              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-900 border border-slate-700 flex items-center space-x-2 shadow-sm"
                            >
                              <span className="text-sm">
                                {ev.type === 'GOAL' ? '⚽' : ev.type === 'YELLOW' ? '🟨' : '🟥'}
                              </span>
                              <span className="text-white font-bold">{ev.playerName}</span>
                              {ev.minute && <span className="text-red-400 font-mono">({ev.minute})</span>}
                              <span className="text-slate-400 text-[11px]">
                                [{ev.team === 'A' ? activeStandaloneMatch.teamA.name : activeStandaloneMatch.teamB.name}]
                              </span>
                              <button
                                type="button"
                                onClick={() => handleRemoveEvent(activeStandaloneMatch, evIdx)}
                                className="text-slate-500 hover:text-red-400 ml-1.5 cursor-pointer font-bold"
                                title="Hapus Catatan"
                              >
                                ✕
                              </button>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500 italic">
                          Belum ada gol atau kartu dicatat pada laga ini. Klik tombol &ldquo;+ Gol&rdquo;, &ldquo;+ KK&rdquo;, atau &ldquo;+ KM&rdquo; di atas untuk mencatat.
                        </p>
                      )}
                    </div>

                    {/* FOOTER ACTION: BIG SAVE BUTTON */}
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-800">
                      <div className="text-xs text-slate-400 flex items-center space-x-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>Skor dan pencetak gol otomatis terhubung ke klasemen grup dan top scorer publik.</span>
                      </div>

                      <div className="flex items-center space-x-3 w-full sm:w-auto">
                        <button
                          type="button"
                          onClick={() => handleSaveLiveMatch(activeStandaloneMatch)}
                          disabled={isSavingFocused}
                          className="w-full sm:w-auto px-8 py-3.5 rounded-2xl bg-gradient-to-r from-red-600 via-red-500 to-amber-500 hover:from-red-500 hover:to-amber-400 text-white font-black text-sm uppercase tracking-wider transition shadow-xl shadow-red-600/40 flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50 active:scale-98"
                        >
                          <Save className={`w-4 h-4 ${isSavingFocused ? 'animate-spin' : ''}`} />
                          <span>{isSavingFocused ? 'Menyimpan & Menghitung...' : '💾 SIMPAN SKOR LIVE & KLASEMEN'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()
            ) : (
              <div className="p-8 rounded-3xl bg-slate-900 border border-slate-800 text-center space-y-4">
                <p className="text-slate-400 text-sm">
                  Belum ada jadwal pertandingan yang dipilih atau tersedia.
                </p>
                <button
                  type="button"
                  onClick={() => setIsStandaloneMode(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs"
                >
                  Tutup Mode Standalone
                </button>
              </div>
            )}
          </main>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: TAMBAH JADWAL BARU (SUPER ADMIN, PANITIA INTI & PANITIA UMUM)     */}
      {/* ========================================================================= */}
      {isAddMatchOpen && canFullManageSchedule && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <form
            onSubmit={handleCreateNewMatch}
            className="w-full max-w-lg p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h4 className="font-bold text-white text-base uppercase">
                  Tambah Jadwal Pertandingan Lengkap
                </h4>
                <p className="text-[11px] text-slate-400">
                  Pilih tim dari pendaftaran yang berstatus <strong>APPROVED</strong>.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddMatchOpen(false)}
                className="text-slate-400 hover:text-white text-xs cursor-pointer p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Warning if team already scheduled */}
            {scheduleWarning && (
              <div className="p-3 rounded-xl bg-amber-950/60 border border-amber-500/50 text-amber-200 text-xs font-semibold flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>{scheduleWarning}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {/* Kategori Turnamen */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Kategori:</label>
                <select
                  value={newMatchData.category}
                  onChange={e => {
                    setNewMatchData({
                      ...newMatchData,
                      category: e.target.value as TournamentCategory,
                      teamA: { name: '', score: 0 },
                      teamB: { name: '', score: 0 },
                    });
                    setScheduleWarning(null);
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white cursor-pointer"
                >
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Babak Pertandingan */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Babak Pertandingan:</label>
                <select
                  value={newMatchData.round}
                  onChange={e => setNewMatchData({ ...newMatchData, round: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white cursor-pointer"
                >
                  <option value="Penyisihan Grup">Penyisihan Grup</option>
                  <option value="Babak 16 Besar">Babak 16 Besar</option>
                  <option value="Perempat Final">Perempat Final</option>
                  <option value="Semifinal">Semifinal</option>
                  <option value="Perebutan Juara 3">Perebutan Juara 3</option>
                  <option value="Grand Final">Grand Final</option>
                </select>
              </div>

              {/* Grup (Opsional) */}
              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-300 mb-1">Grup (Opsional, khusus fase grup):</label>
                <input
                  type="text"
                  placeholder="Contoh: Grup A / Grup B"
                  value={newMatchData.group || ''}
                  onChange={e => setNewMatchData({ ...newMatchData, group: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white"
                />
              </div>

              {/* Nama Tim A (Dropdown Approved) */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Nama Tim A (Status Approved):</label>
                {(() => {
                  const currentCat = newMatchData.category || 'SMA';
                  const approved = getApprovedTeams(currentCat);

                  return approved.length === 0 ? (
                    <p className="text-[11px] text-amber-400 bg-amber-950/40 p-2 rounded-xl border border-amber-800/40">
                      Belum ada tim berstatus APPROVED di kategori {currentCat}.
                    </p>
                  ) : (
                    <select
                      value={newMatchData.teamA?.name || ''}
                      onChange={e => {
                        const val = e.target.value;
                        setScheduleWarning(null);
                        setNewMatchData(prev => ({
                          ...prev,
                          teamA: { ...prev.teamA!, name: val },
                        }));
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white cursor-pointer"
                      required
                    >
                      <option value="">-- Pilih Tim A --</option>
                      {approved.map(t => {
                        const isOther =
                          t.teamName.trim().toLowerCase() ===
                          (newMatchData.teamB?.name || '').trim().toLowerCase();
                        return (
                          <option
                            key={t.id}
                            value={t.teamName}
                            disabled={isOther}
                            className={isOther ? 'text-slate-500' : 'text-white'}
                          >
                            {t.teamName} {isOther ? '(Dipilih di Tim B)' : t.institutionName ? `(${t.institutionName})` : '✓'}
                          </option>
                        );
                      })}
                    </select>
                  );
                })()}
              </div>

              {/* Nama Tim B (Dropdown Approved) */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Nama Tim B (Status Approved):</label>
                {(() => {
                  const currentCat = newMatchData.category || 'SMA';
                  const approved = getApprovedTeams(currentCat);

                  return approved.length === 0 ? (
                    <p className="text-[11px] text-amber-400 bg-amber-950/40 p-2 rounded-xl border border-amber-800/40">
                      Belum ada tim berstatus APPROVED di kategori {currentCat}.
                    </p>
                  ) : (
                    <select
                      value={newMatchData.teamB?.name || ''}
                      onChange={e => {
                        const val = e.target.value;
                        setScheduleWarning(null);
                        setNewMatchData(prev => ({
                          ...prev,
                          teamB: { ...prev.teamB!, name: val },
                        }));
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white cursor-pointer"
                      required
                    >
                      <option value="">-- Pilih Tim B --</option>
                      {approved.map(t => {
                        const isOther =
                          t.teamName.trim().toLowerCase() ===
                          (newMatchData.teamA?.name || '').trim().toLowerCase();
                        return (
                          <option
                            key={t.id}
                            value={t.teamName}
                            disabled={isOther}
                            className={isOther ? 'text-slate-500' : 'text-white'}
                          >
                            {t.teamName} {isOther ? '(Dipilih di Tim A)' : t.institutionName ? `(${t.institutionName})` : '✓'}
                          </option>
                        );
                      })}
                    </select>
                  );
                })()}
              </div>

              {/* Tanggal */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Tanggal (YYYY-MM-DD):</label>
                <input
                  type="date"
                  value={newMatchData.date}
                  onChange={e => setNewMatchData({ ...newMatchData, date: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white"
                  required
                />
              </div>

              {/* Waktu */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Waktu (Jam:Menit WIB):</label>
                <input
                  type="time"
                  value={newMatchData.time}
                  onChange={e => setNewMatchData({ ...newMatchData, time: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white"
                  required
                />
              </div>

              {/* Nama Lapangan Default */}
              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-300 mb-1">Nama Lapangan / Venue Pertandingan:</label>
                <input
                  type="text"
                  placeholder="Gedung Utama GOR Tawang Alun Banyuwangi"
                  value={newMatchData.pitch || DEFAULT_PITCH}
                  onChange={e => setNewMatchData({ ...newMatchData, pitch: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-semibold"
                  required
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Default: <em>{DEFAULT_PITCH}</em>
                </p>
              </div>
            </div>

            <div className="pt-3 flex items-center justify-end space-x-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsAddMatchOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-xs font-bold text-white cursor-pointer shadow-md shadow-red-950/40"
              >
                Simpan Jadwal Pertandingan
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: EDIT JADWAL LENGKAP (SUPER ADMIN, PANITIA INTI & PANITIA UMUM)    */}
      {/* ========================================================================= */}
      {editingMatch && editMatchForm && canFullManageSchedule && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <form
            onSubmit={handleSaveEditMatch}
            className="w-full max-w-lg p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h4 className="font-bold text-white text-base uppercase">
                  Edit Jadwal Match #{editingMatch.matchNumber}
                </h4>
                <p className="text-[11px] text-slate-400">
                  Ubah rincian babak, tanggal, lapangan, atau susunan tim yang bertanding.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingMatch(null);
                  setEditMatchForm(null);
                }}
                className="text-slate-400 hover:text-white text-xs cursor-pointer p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Warning banner */}
            {scheduleWarning && (
              <div className="p-3 rounded-xl bg-amber-950/60 border border-amber-500/50 text-amber-200 text-xs font-semibold flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>{scheduleWarning}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {/* Kategori Turnamen */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Kategori:</label>
                <select
                  value={editMatchForm.category}
                  onChange={e => {
                    setEditMatchForm({
                      ...editMatchForm,
                      category: e.target.value as TournamentCategory,
                    });
                    setScheduleWarning(null);
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white cursor-pointer"
                >
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Babak Pertandingan */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Babak Pertandingan:</label>
                <input
                  type="text"
                  value={editMatchForm.round}
                  onChange={e => setEditMatchForm({ ...editMatchForm, round: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white"
                  required
                />
              </div>

              {/* Grup (Opsional) */}
              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-300 mb-1">Grup (Opsional):</label>
                <input
                  type="text"
                  placeholder="Contoh: Grup A"
                  value={editMatchForm.group || ''}
                  onChange={e => setEditMatchForm({ ...editMatchForm, group: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white"
                />
              </div>

              {/* Tim A */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Tim A (Approved):</label>
                {(() => {
                  const approved = getApprovedTeams(editMatchForm.category);

                  return (
                    <select
                      value={editMatchForm.teamAName}
                      onChange={e => {
                        const val = e.target.value;
                        setScheduleWarning(null);
                        setEditMatchForm({ ...editMatchForm, teamAName: val });
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white cursor-pointer"
                      required
                    >
                      <option value="">-- Pilih Tim A --</option>
                      {approved.map(t => {
                        const isOther =
                          t.teamName.trim().toLowerCase() ===
                          (editMatchForm.teamBName || '').trim().toLowerCase();
                        return (
                          <option
                            key={t.id}
                            value={t.teamName}
                            disabled={isOther}
                            className={isOther ? 'text-slate-500' : 'text-white'}
                          >
                            {t.teamName} {isOther ? '(Dipilih di Tim B)' : t.institutionName ? `(${t.institutionName})` : '✓'}
                          </option>
                        );
                      })}
                    </select>
                  );
                })()}
              </div>

              {/* Tim B */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Tim B (Approved):</label>
                {(() => {
                  const approved = getApprovedTeams(editMatchForm.category);

                  return (
                    <select
                      value={editMatchForm.teamBName}
                      onChange={e => {
                        const val = e.target.value;
                        setScheduleWarning(null);
                        setEditMatchForm({ ...editMatchForm, teamBName: val });
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white cursor-pointer"
                      required
                    >
                      <option value="">-- Pilih Tim B --</option>
                      {approved.map(t => {
                        const isOther =
                          t.teamName.trim().toLowerCase() ===
                          (editMatchForm.teamAName || '').trim().toLowerCase();
                        return (
                          <option
                            key={t.id}
                            value={t.teamName}
                            disabled={isOther}
                            className={isOther ? 'text-slate-500' : 'text-white'}
                          >
                            {t.teamName} {isOther ? '(Dipilih di Tim A)' : t.institutionName ? `(${t.institutionName})` : '✓'}
                          </option>
                        );
                      })}
                    </select>
                  );
                })()}
              </div>

              {/* Tanggal */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Tanggal (YYYY-MM-DD):</label>
                <input
                  type="date"
                  value={editMatchForm.date}
                  onChange={e => setEditMatchForm({ ...editMatchForm, date: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white"
                  required
                />
              </div>

              {/* Waktu */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Waktu (Jam:Menit WIB):</label>
                <input
                  type="time"
                  value={editMatchForm.time}
                  onChange={e => setEditMatchForm({ ...editMatchForm, time: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white"
                  required
                />
              </div>

              {/* Lapangan */}
              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-300 mb-1">Lapangan / Venue:</label>
                <input
                  type="text"
                  placeholder="Gedung Utama GOR Tawang Alun Banyuwangi"
                  value={editMatchForm.pitch}
                  onChange={e => setEditMatchForm({ ...editMatchForm, pitch: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white"
                  required
                />
              </div>
            </div>

            <div className="pt-3 flex items-center justify-end space-x-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setEditingMatch(null);
                  setEditMatchForm(null);
                }}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white cursor-pointer"
              >
                Simpan Perubahan Jadwal
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: PENCATATAN GOL & PELANGGARAN DENGAN DROPDOWN NAMA PEMAIN OTOMATIS   */}
      {/* ========================================================================= */}
      {eventModalData && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <span className="text-xl">
                  {eventModalData.type === 'GOAL' ? '⚽' : eventModalData.type === 'YELLOW' ? '🟨' : '🟥'}
                </span>
                <div>
                  <h4 className="font-bold text-white text-sm uppercase">
                    {eventModalData.type === 'GOAL'
                      ? 'Catat Gol Pertandingan'
                      : eventModalData.type === 'YELLOW'
                      ? 'Catat Kartu Kuning'
                      : 'Catat Kartu Merah'}
                  </h4>
                  <p className="text-[10px] text-slate-400">
                    Match #{eventModalData.match.matchNumber} ({eventModalData.match.category})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEventModalData(null)}
                className="text-slate-400 hover:text-white cursor-pointer p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              {/* Pilih Tim yang Bertanding */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1.5">
                  Pilih Tim Pemain:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setEventModalData({
                        ...eventModalData,
                        teamSide: 'A',
                        playerName: '',
                        isCustomPlayer: false,
                        customName: '',
                      })
                    }
                    className={`p-2.5 rounded-xl border text-xs font-bold transition flex items-center justify-center space-x-1.5 cursor-pointer ${
                      eventModalData.teamSide === 'A'
                        ? 'bg-red-600 text-white border-red-500 shadow-md shadow-red-950/40'
                        : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    <Shield className="w-3.5 h-3.5" />
                    <span className="truncate">{eventModalData.match.teamA.name}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setEventModalData({
                        ...eventModalData,
                        teamSide: 'B',
                        playerName: '',
                        isCustomPlayer: false,
                        customName: '',
                      })
                    }
                    className={`p-2.5 rounded-xl border text-xs font-bold transition flex items-center justify-center space-x-1.5 cursor-pointer ${
                      eventModalData.teamSide === 'B'
                        ? 'bg-red-600 text-white border-red-500 shadow-md shadow-red-950/40'
                        : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    <Shield className="w-3.5 h-3.5" />
                    <span className="truncate">{eventModalData.match.teamB.name}</span>
                  </button>
                </div>
              </div>

              {/* Dropdown Pemain dari Tim yang Sedang Bertanding */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1.5">
                  Nama Pemain (Otomatis dari Data Pemain Tim):
                </label>
                {(() => {
                  const currentTeamName =
                    eventModalData.teamSide === 'A'
                      ? eventModalData.match.teamA.name
                      : eventModalData.match.teamB.name;

                  const teamPlayers = players.filter(
                    p => p.teamName.trim().toLowerCase() === currentTeamName.trim().toLowerCase()
                  );

                  return (
                    <div className="space-y-2">
                      <select
                        value={
                          eventModalData.isCustomPlayer
                            ? '__CUSTOM__'
                            : eventModalData.playerName
                        }
                        onChange={e => {
                          const val = e.target.value;
                          if (val === '__CUSTOM__') {
                            setEventModalData({
                              ...eventModalData,
                              isCustomPlayer: true,
                              playerName: '',
                            });
                          } else {
                            setEventModalData({
                              ...eventModalData,
                              isCustomPlayer: false,
                              playerName: val,
                            });
                          }
                        }}
                        className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white cursor-pointer font-medium"
                      >
                        <option value="">-- Pilih Pemain {currentTeamName} --</option>
                        {teamPlayers.map(p => (
                          <option key={p.id} value={p.name}>
                            {p.name} {p.jerseyNumber ? `(#${p.jerseyNumber})` : ''} {p.position ? `[${p.position}]` : ''}
                          </option>
                        ))}
                        <option value="__CUSTOM__">+ Ketik Nama Pemain Manual (Jika Belum Ada di DB)</option>
                      </select>

                      {/* Manual input if custom or no players registered */}
                      {(eventModalData.isCustomPlayer || teamPlayers.length === 0) && (
                        <div className="pt-1">
                          <input
                            type="text"
                            placeholder="Ketik nama lengkap pemain..."
                            value={eventModalData.customName}
                            onChange={e =>
                              setEventModalData({
                                ...eventModalData,
                                customName: e.target.value,
                              })
                            }
                            className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-amber-500/50 text-white placeholder-slate-500 text-xs"
                          />
                          {teamPlayers.length === 0 && (
                            <p className="text-[10px] text-amber-400 mt-1">
                              Belum ada pemain diinput untuk tim <strong>{currentTeamName}</strong> di menu Data Pemain. Anda dapat mengetikkan nama pemain manual di sini.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Menit Terjadinya Event */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Menit Terjadinya Event (Contoh: 14 atau 25'):
                </label>
                <input
                  type="text"
                  placeholder="Contoh: 12"
                  value={eventModalData.minute}
                  onChange={e =>
                    setEventModalData({
                      ...eventModalData,
                      minute: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white"
                />
              </div>

              {eventModalData.type === 'GOAL' && (
                <div className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-[11px]">
                  ⚽ <strong>Info:</strong> Menambahkan gol akan otomatis menambah skor +1 untuk tim yang bersangkutan (skor tetap bisa disesuaikan manual via tombol + / -).
                </div>
              )}
            </div>

            <div className="pt-3 flex items-center justify-end space-x-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setEventModalData(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveEventFromModal}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white cursor-pointer shadow-md shadow-emerald-950/40"
              >
                Simpan Catatan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
