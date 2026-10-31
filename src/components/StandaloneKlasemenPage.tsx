import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useTournament } from '../context/TournamentContext';
import { TournamentCategory, TeamStandingItem, MatchItem, MatchStatus } from '../types';
import {
  Trophy,
  Calendar,
  Flame,
  ArrowLeft,
  Search,
  RefreshCw,
  Clock,
  Shield,
  Layers,
  AlertTriangle,
  Filter,
  Zap,
  WifiOff,
  Inbox,
  Award,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  Info,
  X,
  Sun,
  Moon,
  Users,
} from 'lucide-react';
import { WabupCupLogo } from './WabupCupLogo';

interface StandaloneKlasemenPageProps {
  onBackToHome: () => void;
  onOpenRegister?: (category?: TournamentCategory) => void;
  onOpenAdmin?: () => void;
}

export const StandaloneKlasemenPage: React.FC<StandaloneKlasemenPageProps> = ({
  onBackToHome,
  onOpenAdmin,
}) => {
  const {
    theme,
    toggleTheme,
    config,
    categories,
    matches,
    groups,
    standings,
    players,
    registrations,
    refreshStandings,
    refreshPlayers,
    refreshMatches,
    isSyncingWithServer,
    isInitialLoading,
    dbStatus,
  } = useTournament();

  // Visibility settings from CMS
  const sectionsVis = config.sectionsVisibility;
  const isMasterStandaloneOpen = (sectionsVis?.standaloneKlasemen ?? true) !== false;
  const isTabKlasemenVisible = (sectionsVis?.standaloneTabKlasemen ?? true) !== false;
  const isTabJadwalVisible = (sectionsVis?.standaloneTabJadwal ?? true) !== false;
  const isTabTopScoreVisible = (sectionsVis?.standaloneTabTopScore ?? true) !== false;
  const isTabKnockoutVisible = (sectionsVis?.standaloneTabKnockout ?? true) !== false;

  // Active Main Tab: 'JADWAL' | 'KLASEMEN' | 'TOPSKOR' | 'KNOCKOUT'
  const [activeTab, setActiveTab] = useState<'JADWAL' | 'KLASEMEN' | 'TOPSKOR' | 'KNOCKOUT'>('KLASEMEN');

  // Auto-switch tab if current active tab is disabled in CMS
  useEffect(() => {
    const isCurrentActive =
      (activeTab === 'KLASEMEN' && isTabKlasemenVisible) ||
      (activeTab === 'JADWAL' && isTabJadwalVisible) ||
      (activeTab === 'TOPSKOR' && isTabTopScoreVisible) ||
      (activeTab === 'KNOCKOUT' && isTabKnockoutVisible);

    if (!isCurrentActive) {
      if (isTabKlasemenVisible) setActiveTab('KLASEMEN');
      else if (isTabJadwalVisible) setActiveTab('JADWAL');
      else if (isTabTopScoreVisible) setActiveTab('TOPSKOR');
      else if (isTabKnockoutVisible) setActiveTab('KNOCKOUT');
    }
  }, [activeTab, isTabKlasemenVisible, isTabJadwalVisible, isTabTopScoreVisible, isTabKnockoutVisible]);

  // Selected Category initialized with URL query parameter support (e.g. /klasemen?category=SMA)
  const [selectedCat, setSelectedCat] = useState<TournamentCategory>(() => {
    if (typeof window !== 'undefined') {
      const urlCat = new URLSearchParams(window.location.search).get('category');
      if (urlCat) return urlCat;
    }
    return categories[0]?.id || 'SMA';
  });

  // Sync selected category with URL query param so category pages are direct and indexable
  useEffect(() => {
    if (typeof window !== 'undefined' && selectedCat) {
      const url = new URL(window.location.href);
      if (url.searchParams.get('category') !== selectedCat) {
        url.searchParams.set('category', selectedCat);
        window.history.replaceState(null, '', url.pathname + url.search + url.hash);
      }
    }
  }, [selectedCat]);

  // Sub-filters for Jadwal & Hasil tab
  const [viewMode, setViewMode] = useState<'PER_GRUP' | 'ALL_TIMELINE'>('PER_GRUP');
  const [selectedGroup, setSelectedGroup] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<'ALL' | 'LIVE' | 'FINISHED' | 'UPCOMING'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Sub-filter for Bagan Knockout (Pill selector ronde)
  const [selectedKnockoutStage, setSelectedKnockoutStage] = useState<string>('ALL');

  // Reset knockout round filter when category changes
  useEffect(() => {
    setSelectedKnockoutStage('ALL');
  }, [selectedCat]);

  // Modal Singkatan Klasemen (M, W, S, K, GM, GK, SG, P)
  const [showAbbreviationModal, setShowAbbreviationModal] = useState(false);

  // Helper untuk mendapatkan logo tim secara proporsional & konsisten
  const getTeamLogo = (teamName: string, existingLogo?: string) => {
    const norm = (teamName || '').trim().toLowerCase();
    if (!norm) return existingLogo || '';

    // 1. Prioritaskan logo real-time terbaru dari database pendaftar (registrations)
    const reg = registrations.find(
      r => (r.teamName && r.teamName.trim().toLowerCase() === norm) ||
           (r.institutionName && r.institutionName.trim().toLowerCase() === norm)
    );
    const regLogo = reg?.teamLogo || (reg?.documents as any)?.logoTim?.url || (reg?.documents as any)?.logoTim?.fileData;
    if (regLogo && typeof regLogo === 'string' && regLogo.trim()) {
      return regLogo;
    }

    // 2. Fallback ke logo yang sudah tersimpan di objek grup / laga jika ada
    if (existingLogo && typeof existingLogo === 'string' && existingLogo.trim()) {
      return existingLogo;
    }

    return '';
  };

  // Helper untuk membersihkan prefix "Kategori " agar label tidak redundan
  const cleanCategoryName = (name?: string) => {
    if (!name) return '';
    return name.replace(/^kategori\s+/i, '').trim();
  };

  // Helper untuk mengecek apakah tim sedang aktif bertanding LIVE
  const getTeamLiveMatch = (teamName: string) => {
    const norm = teamName.trim().toLowerCase();
    return matches.find(m => {
      const isLive = m.status === 'LIVE' || (m.status as string) === 'berlangsung';
      if (!isLive) return false;
      return (
        m.teamA?.name?.trim().toLowerCase() === norm ||
        m.teamB?.name?.trim().toLowerCase() === norm
      );
    });
  };

  // Helper untuk mendapatkan nama sekolah/instansi tim
  const getTeamInstitution = (teamName: string, existingInstitution?: string) => {
    if (existingInstitution && existingInstitution.trim()) return existingInstitution;
    const reg = registrations.find(
      r => r.teamName.trim().toLowerCase() === teamName.trim().toLowerCase()
    );
    return reg?.institutionName || '';
  };

  // Category Glass Horizontal Scroller state & helpers
  const categoryScrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkCategoryScroll = () => {
    const el = categoryScrollRef.current;
    if (el) {
      setCanScrollLeft(el.scrollLeft > 6);
      setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 6);
    }
  };

  useEffect(() => {
    checkCategoryScroll();
    window.addEventListener('resize', checkCategoryScroll);
    return () => window.removeEventListener('resize', checkCategoryScroll);
  }, [categories]);

  const scrollCategories = (direction: 'left' | 'right') => {
    if (categoryScrollRef.current) {
      const amount = direction === 'left' ? -260 : 260;
      categoryScrollRef.current.scrollBy({ left: amount, behavior: 'smooth' });
      setTimeout(checkCategoryScroll, 350);
    }
  };

  // Robust timeout & error handling to eliminate infinite loading spinner
  const [syncTimedOut, setSyncTimedOut] = useState(false);
  const [hasSyncError, setHasSyncError] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  const handleManualRefresh = async () => {
    setSyncTimedOut(false);
    setHasSyncError(false);
    setIsRetrying(true);
    try {
      await Promise.allSettled([
        refreshStandings(),
        refreshPlayers(true),
        refreshMatches ? refreshMatches() : Promise.resolve(),
      ]);
    } catch (err) {
      console.warn('Manual refresh failed:', err);
      setHasSyncError(true);
    } finally {
      setIsRetrying(false);
    }
  };

  // Initial Auto-sync with Database when component mounts:
  // TournamentContext already initializes data from server on app load.
  // We only fetch standings if not yet available in state/localStorage, preventing duplicate full dataset fetch.
  useEffect(() => {
    if (!standings || Object.keys(standings).length === 0) {
      refreshStandings();
    }
  }, []);

  // On-Demand Data Sync (Hemat FOT Vercel & TiDB Cloud RU):
  // Polling background otomatis dinonaktifkan agar tab yang terbuka tidak mengonsumsi kuota FOT & RU terus-menerus.
  // Data disinkronkan saat halaman dibuka atau saat pengguna menekan tombol 'Perbarui'.

  // 5-second loading timeout watchdog: if initial loading or syncing takes > 5s, turn off skeleton
  useEffect(() => {
    if (isInitialLoading || isSyncingWithServer || isRetrying) {
      const timer = setTimeout(() => {
        setSyncTimedOut(true);
      }, 5000);
      return () => clearTimeout(timer);
    } else {
      setSyncTimedOut(false);
    }
  }, [isInitialLoading, isSyncingWithServer, isRetrying]);

  // If DB status reports error, flag sync error
  useEffect(() => {
    if (dbStatus?.error && !dbStatus.connected) {
      setHasSyncError(true);
    }
  }, [dbStatus]);

  // Navigation auto-hide on scroll down only, and appear when stationary/idle (diam).
  // "Tampil saat di-scroll ke atas" has been removed per instruction.
  const [isNavVisible, setIsNavVisible] = useState(true);

  // Exact header height tracking to guarantee category bar and content are never obscured on mobile
  const headerRef = useRef<HTMLElement>(null);
  const [headerHeight, setHeaderHeight] = useState<number>(0);

  useEffect(() => {
    const updateHeaderHeight = () => {
      if (headerRef.current) {
        const height = headerRef.current.offsetHeight;
        if (height > 0) {
          setHeaderHeight(height);
        }
      }
    };

    updateHeaderHeight();

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && headerRef.current) {
      ro = new ResizeObserver(() => {
        updateHeaderHeight();
      });
      ro.observe(headerRef.current);
    }

    window.addEventListener('resize', updateHeaderHeight);

    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', updateHeaderHeight);
    };
  }, []);

  useEffect(() => {
    const getScrollTop = () =>
      Math.max(0, window.pageYOffset || document.documentElement.scrollTop || window.scrollY || 0);

    let lastScrollY = getScrollTop();
    let idleTimer: ReturnType<typeof setTimeout> | null = null;

    const handleScroll = () => {
      const currentScrollY = getScrollTop();

      // Always show navigation near top of page
      if (currentScrollY <= 50) {
        setIsNavVisible(true);
        if (idleTimer) clearTimeout(idleTimer);
        lastScrollY = currentScrollY;
        return;
      }

      const diff = currentScrollY - lastScrollY;

      // Hanya Auto-Hide saat di-scroll ke bawah
      if (diff > 5) {
        setIsNavVisible(false);
      }
      // CATATAN: "Tampil saat di-scroll ke atas" DIHAPUS (jangan gunakan).
      // Navigasi tidak akan muncul saat scroll ke atas sampai pengguna berhenti scroll (diam).

      lastScrollY = currentScrollY;

      // "Tampil saat diam" -> saat user berhenti scroll (diam 300ms), navigasi segera tampil kembali
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        setIsNavVisible(true);
      }, 300);
    };

    const handleScrollEnd = () => {
      const currentScrollY = getScrollTop();
      if (currentScrollY <= 50) {
        setIsNavVisible(true);
        return;
      }
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        setIsNavVisible(true);
      }, 150);
    };

    const handleTouchEnd = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        setIsNavVisible(true);
      }, 250);
    };

    const handleMouseMove = (e: MouseEvent) => {
      // If mouse cursor moves towards top near navigation area, reveal navigation
      if (e.clientY <= 60) {
        setIsNavVisible(true);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('scrollend', handleScrollEnd, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });
    window.addEventListener('mousemove', handleMouseMove, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('scrollend', handleScrollEnd);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('mousemove', handleMouseMove);
      if (idleTimer) clearTimeout(idleTimer);
    };
  }, []);

  // Ensure selected category is valid
  useEffect(() => {
    if (categories.length > 0 && !categories.some(c => c.id === selectedCat)) {
      setSelectedCat(categories[0].id);
    }
  }, [categories, selectedCat]);

  // Current Category details
  const currentCatDetail = useMemo(() => {
    return categories.find(c => c.id === selectedCat) || {
      id: selectedCat,
      name: selectedCat,
      maxTeams: 32,
      prizePool: 'Rp 11.000.000',
    };
  }, [categories, selectedCat]);

  // Groups belonging to current category
  const catGroups = useMemo(() => {
    return groups.filter(g => g.category === selectedCat);
  }, [groups, selectedCat]);

  // Group standings map for selected category
  const catStandings = useMemo(() => {
    const list: { groupName: string; teams: TeamStandingItem[] }[] = [];
    if (catGroups.length > 0) {
      for (const grp of catGroups) {
        const key = `${selectedCat}:::${grp.groupName}`;
        const teams = standings[key] || [];
        list.push({ groupName: grp.groupName, teams });
      }
    } else {
      for (const [key, teams] of Object.entries(standings)) {
        if (key.startsWith(`${selectedCat}:::`)) {
          const groupName = key.split(':::')[1];
          list.push({ groupName, teams });
        }
      }
    }
    return list;
  }, [catGroups, standings, selectedCat]);

  // Matches for this category
  const catMatches = useMemo(() => {
    return matches.filter(m => m.category === selectedCat);
  }, [matches, selectedCat]);

  const isKnockoutMatch = (m: MatchItem) =>
    !m.group ||
    m.round.toLowerCase().includes('final') ||
    m.round.toLowerCase().includes('besar') ||
    m.round.toLowerCase().includes('play') ||
    m.round.toLowerCase().includes('gugur');

  // Cek apakah tim masih berupa placeholder / TBD / belum terisi
  const isPlaceholderTeam = (team?: { name?: string; institution?: string }) => {
    if (!team || !team.name) return true;
    const name = team.name.trim();
    if (!name || name === 'TBD' || name === '-' || name === 'Belum Ada Tim') return true;
    if (team.institution === 'Menunggu Hasil Grup' || team.institution === 'TBD') return true;
    if (/^(?:Juara|Pemenang|Runner-?up|Peringkat\s+2|Kalah)\s+(?:Grup|Terbaik|Play-?off|\d+|Match|Perempat|Semifinal)/i.test(name)) {
      return true;
    }
    return false;
  };

  // Hanya tampilkan laga yang kedua timnya sudah resmi/definitif
  const hasRealTeams = (m: MatchItem) => {
    if (m.status === 'FINISHED') return true;
    return !isPlaceholderTeam(m.teamA) && !isPlaceholderTeam(m.teamB);
  };

  // Upcoming matches (UPCOMING or LIVE), prioritized by LIVE -> Knockout -> Group -> Tanggal & Jam
  const upcomingMatches = useMemo(() => {
    const validMatches = catMatches.filter(hasRealTeams);
    const sorted = [...validMatches].sort((a, b) => {
      // 1. LIVE matches first
      if (a.status === 'LIVE' && b.status !== 'LIVE') return -1;
      if (b.status === 'LIVE' && a.status !== 'LIVE') return 1;

      // 2. Knockout matches prioritized over Group matches
      const aIsKo = isKnockoutMatch(a);
      const bIsKo = isKnockoutMatch(b);
      if (aIsKo && !bIsKo) return -1;
      if (!aIsKo && bIsKo) return 1;

      // 3. Tanggal & Jam
      const dateA = a.date || '';
      const dateB = b.date || '';
      if (dateA !== dateB) return dateA.localeCompare(dateB);

      const timeA = a.time || '';
      const timeB = b.time || '';
      if (timeA !== timeB) return timeA.localeCompare(timeB);

      return (a.matchNumber || 0) - (b.matchNumber || 0);
    });
    return sorted.filter(m => m.status === 'UPCOMING' || m.status === 'LIVE').slice(0, 5);
  }, [catMatches]);

  // Featured recent/detailed matches for bottom right section in Klasemen tab
  const detailedScheduleMatches = useMemo(() => {
    const validMatches = catMatches.filter(hasRealTeams);
    const live = validMatches.filter(m => m.status === 'LIVE');
    const upcoming = validMatches.filter(m => m.status === 'UPCOMING').sort((a, b) => {
      const aIsKo = isKnockoutMatch(a);
      const bIsKo = isKnockoutMatch(b);
      if (aIsKo && !bIsKo) return -1;
      if (!aIsKo && bIsKo) return 1;
      const dateDiff = (a.date || '').localeCompare(b.date || '');
      if (dateDiff !== 0) return dateDiff;
      const timeDiff = (a.time || '').localeCompare(b.time || '');
      if (timeDiff !== 0) return timeDiff;
      return (a.matchNumber || 0) - (b.matchNumber || 0);
    });
    const finished = validMatches.filter(m => m.status === 'FINISHED').sort((a, b) => {
      const aIsKo = isKnockoutMatch(a);
      const bIsKo = isKnockoutMatch(b);
      if (aIsKo && !bIsKo) return -1;
      if (!aIsKo && bIsKo) return 1;
      const dateDiff = (b.date || '').localeCompare(a.date || '');
      if (dateDiff !== 0) return dateDiff;
      return (b.matchNumber || 0) - (a.matchNumber || 0);
    });
    const combined = [...live, ...upcoming, ...finished];
    return combined.slice(0, 6);
  }, [catMatches]);

  // Filtered matches for Jadwal & Hasil tab
  // Aturan urut: LIVE terlebih dahulu -> UPCOMING (sesuai tanggal & jam, fase gugur di atas grup) -> FINISHED (fase gugur di atas grup)
  const filteredMatches = useMemo(() => {
    const list = catMatches.filter(m => {
      // Sembunyikan laga jika nama tim belum definitif / masih placeholder
      if (!hasRealTeams(m)) return false;

      // Group filter
      if (selectedGroup === 'KNOCKOUT') {
        if (!isKnockoutMatch(m)) return false;
      } else if (selectedGroup !== 'ALL') {
        if (m.group !== selectedGroup) return false;
      }

      // Status filter
      if (selectedStatus !== 'ALL') {
        if (m.status !== selectedStatus) return false;
      }

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchNameA = m.teamA.name.toLowerCase().includes(q);
        const matchNameB = m.teamB.name.toLowerCase().includes(q);
        const matchRound = m.round.toLowerCase().includes(q);
        const matchGroup = (m.group || '').toLowerCase().includes(q);
        return matchNameA || matchNameB || matchRound || matchGroup;
      }
      return true;
    });

    return list.sort((a, b) => {
      // 1. Urutan Status Utama: LIVE (1) -> UPCOMING (2) -> FINISHED (3)
      const getStatusRank = (st: MatchStatus) => {
        if (st === 'LIVE') return 1;
        if (st === 'UPCOMING') return 2;
        return 3; // FINISHED
      };
      const rankA = getStatusRank(a.status);
      const rankB = getStatusRank(b.status);
      if (rankA !== rankB) {
        return rankA - rankB;
      }

      // 2. Dalam status yang sama: Fase Gugur lebih dulu, Fase Grup di bawah
      const aIsKo = isKnockoutMatch(a);
      const bIsKo = isKnockoutMatch(b);
      if (aIsKo && !bIsKo) return -1;
      if (!aIsKo && bIsKo) return 1;

      // 3. Dalam fase yang sama: Urutkan sesuai Tanggal Kickoff
      const dateA = a.date || '';
      const dateB = b.date || '';
      if (dateA !== dateB) {
        return dateA.localeCompare(dateB);
      }

      // 4. Urutkan sesuai Jam Kickoff
      const timeA = a.time || '';
      const timeB = b.time || '';
      if (timeA !== timeB) {
        return timeA.localeCompare(timeB);
      }

      // 5. Terakhir urutkan Nomor Pertandingan
      return (a.matchNumber || 0) - (b.matchNumber || 0);
    });
  }, [catMatches, selectedGroup, selectedStatus, searchQuery]);

  // Players belonging to selected category
  const categoryPlayers = useMemo(() => {
    const catTeamNames = new Set<string>();
    for (const g of catGroups) {
      for (const t of g.teams) catTeamNames.add(t.name.trim().toLowerCase());
    }
    for (const m of catMatches) {
      catTeamNames.add(m.teamA.name.trim().toLowerCase());
      catTeamNames.add(m.teamB.name.trim().toLowerCase());
    }

    return players.filter(p => {
      if (p.category && p.category === selectedCat) return true;
      if (p.teamName && catTeamNames.has(p.teamName.trim().toLowerCase())) return true;
      return false;
    });
  }, [players, selectedCat, catGroups, catMatches]);

  // Real Top Scorers (goals > 0 only, no dummy fallback)
  const topScorers = useMemo(() => {
    return [...categoryPlayers]
      .filter(p => (p.goals || 0) > 0)
      .sort((a, b) => (b.goals || 0) - (a.goals || 0) || a.name.localeCompare(b.name));
  }, [categoryPlayers]);

  // Real Disciplined players (yellow > 0 or red > 0, no dummy fallback)
  const disciplinedPlayers = useMemo(() => {
    return [...categoryPlayers]
      .filter(p => (p.yellowCards || 0) > 0 || (p.redCards || 0) > 0)
      .sort((a, b) => {
        const pointsA = (a.redCards || 0) * 3 + (a.yellowCards || 0);
        const pointsB = (b.redCards || 0) * 3 + (b.yellowCards || 0);
        return pointsB - pointsA;
      });
  }, [categoryPlayers]);

  // Knockout Matches
  const knockoutMatches = useMemo(() => {
    return catMatches.filter(m => {
      const r = (m.round || '').toLowerCase();
      const isGroup = Boolean(m.group) && (r.includes('penyisihan') || r.includes('grup') || r.includes('group'));
      if (isGroup) return false;
      return (
        !m.group ||
        r.includes('play') ||
        r.includes('besar') ||
        r.includes('final') ||
        r.includes('juara 3') ||
        r.includes('gugur')
      );
    });
  }, [catMatches]);

  // Lookup map for fast next match linking
  const knockoutMatchMap = useMemo(() => {
    const map = new Map<string, MatchItem>();
    for (const m of knockoutMatches) {
      map.set(m.id, m);
    }
    return map;
  }, [knockoutMatches]);

  // Grouped Knockout Stages (Hierarchical & Responsive)
  const knockoutStages = useMemo(() => {
    if (knockoutMatches.length === 0) return [];

    const stageDefs: Record<string, {
      id: string;
      title: string;
      shortTitle: string;
      icon: string;
      order: number;
      badgeBg: string;
      badgeBorder: string;
      badgeText: string;
    }> = {
      PLAYOFF: {
        id: 'PLAYOFF',
        title: 'Babak Play-off',
        shortTitle: 'Play-off',
        icon: '⚡',
        order: 1,
        badgeBg: 'bg-amber-500/10',
        badgeBorder: 'border-amber-500/30',
        badgeText: 'text-amber-400',
      },
      R32: {
        id: 'R32',
        title: 'Babak 32 Besar',
        shortTitle: '32 Besar',
        icon: '🔥',
        order: 2,
        badgeBg: 'bg-blue-500/10',
        badgeBorder: 'border-blue-500/30',
        badgeText: 'text-blue-400',
      },
      R16: {
        id: 'R16',
        title: 'Babak 16 Besar',
        shortTitle: '16 Besar',
        icon: '⚔️',
        order: 3,
        badgeBg: 'bg-cyan-500/10',
        badgeBorder: 'border-cyan-500/30',
        badgeText: 'text-cyan-400',
      },
      QF: {
        id: 'QF',
        title: 'Perempat Final (8 Besar)',
        shortTitle: '8 Besar',
        icon: '🏟️',
        order: 4,
        badgeBg: 'bg-indigo-500/10',
        badgeBorder: 'border-indigo-500/30',
        badgeText: 'text-indigo-400',
      },
      SF: {
        id: 'SF',
        title: 'Babak Semifinal',
        shortTitle: 'Semifinal',
        icon: '🔥',
        order: 5,
        badgeBg: 'bg-orange-500/10',
        badgeBorder: 'border-orange-500/30',
        badgeText: 'text-orange-400',
      },
      FINAL: {
        id: 'FINAL',
        title: 'Grand Final & Juara 3',
        shortTitle: 'Final',
        icon: '🏆',
        order: 6,
        badgeBg: 'bg-yellow-500/15',
        badgeBorder: 'border-yellow-500/40',
        badgeText: 'text-yellow-400',
      },
    };

    const stageBuckets: Record<string, MatchItem[]> = {
      PLAYOFF: [],
      R32: [],
      R16: [],
      QF: [],
      SF: [],
      FINAL: [],
    };

    const getStageKey = (m: MatchItem): string => {
      const r = (m.round || '').toLowerCase();
      if (r.includes('play-off') || r.includes('playoff') || r.includes('22 besar')) return 'PLAYOFF';
      if (r.includes('32 besar') || r.includes('round of 32')) return 'R32';
      if (r.includes('16 besar') || r.includes('round of 16')) return 'R16';
      if (r.includes('perempat') || r.includes('8 besar') || r.includes('quarter') || r.includes('qf')) return 'QF';
      if ((r.includes('semifinal') || r.includes('semi-final') || r.includes('semi final')) && !r.includes('perempat')) return 'SF';
      if (r.includes('final') || r.includes('juara 3') || r.includes('3rd')) return 'FINAL';
      return 'FINAL';
    };

    const getMatchSortScore = (m: MatchItem): number => {
      const r = (m.round || '').toLowerCase();
      const isGrandFinal = r.includes('grand final') || (r.includes('final') && !r.includes('juara 3') && !r.includes('perempat') && !r.includes('semi'));
      const isJuara3 = r.includes('juara 3') || r.includes('3rd');
      if (isJuara3) return 9998;
      if (isGrandFinal) return 9999;

      const numMatch = m.round.match(/(?:Match|Final|Perempat|Semifinal)\s*#?\s*(\d+)/i);
      if (numMatch && numMatch[1]) {
        return parseInt(numMatch[1], 10);
      }
      return m.matchNumber || 0;
    };

    for (const m of knockoutMatches) {
      const key = getStageKey(m);
      if (stageBuckets[key]) {
        stageBuckets[key].push(m);
      }
    }

    return Object.entries(stageBuckets)
      .filter(([_, list]) => list.length > 0)
      .map(([key, list]) => {
        const sorted = [...list].sort((a, b) => {
          const scoreA = getMatchSortScore(a);
          const scoreB = getMatchSortScore(b);
          if (scoreA !== scoreB) return scoreA - scoreB;
          if (a.date && b.date && a.date !== b.date) return a.date.localeCompare(b.date);
          if (a.time && b.time && a.time !== b.time) return a.time.localeCompare(b.time);
          return 0;
        });
        return {
          ...stageDefs[key],
          matches: sorted,
        };
      })
      .sort((a, b) => a.order - b.order);
  }, [knockoutMatches]);

  const activeSelectedStage = useMemo(() => {
    if (selectedKnockoutStage === 'ALL') return null;
    return knockoutStages.find(s => s.id === selectedKnockoutStage) || null;
  }, [knockoutStages, selectedKnockoutStage]);

  // Category counts from real registrations
  const categoryRegistrationCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of registrations) {
      if (r.status !== 'REJECTED') {
        map[r.category] = (map[r.category] || 0) + 1;
      }
    }
    return map;
  }, [registrations]);

  // Helper to compute team form (last 5 matches: W, D, L)
  const getTeamForm = (teamName: string) => {
    const teamFinished = matches.filter(
      m =>
        m.status === 'FINISHED' &&
        (m.teamA.name.toLowerCase() === teamName.toLowerCase() ||
          m.teamB.name.toLowerCase() === teamName.toLowerCase())
    );

    if (teamFinished.length === 0) {
      return [];
    }

    const forms: ('W' | 'D' | 'L')[] = [];
    for (const m of teamFinished.slice(-5)) {
      const isTeamA = m.teamA.name.toLowerCase() === teamName.toLowerCase();
      const scoreMy = isTeamA ? (m.teamA.score ?? 0) : (m.teamB.score ?? 0);
      const scoreOpp = isTeamA ? (m.teamB.score ?? 0) : (m.teamA.score ?? 0);
      if (scoreMy > scoreOpp) forms.push('W');
      else if (scoreMy === scoreOpp) forms.push('D');
      else forms.push('L');
    }
    return forms;
  };

  // Render Card Pertandingan Knockout
  const renderKnockoutMatchCard = (m: MatchItem) => {
    const isLight = theme === 'light';
    const isTeamAWinner =
      m.status === 'FINISHED' &&
      (m.winnerId === 'A' ||
        (m.teamA.score !== undefined && m.teamB.score !== undefined && m.teamA.score > m.teamB.score) ||
        (m.teamA.score === m.teamB.score && (m.teamA.penalties ?? 0) > (m.teamB.penalties ?? 0)));
    const isTeamBWinner =
      m.status === 'FINISHED' &&
      (m.winnerId === 'B' ||
        (m.teamA.score !== undefined && m.teamB.score !== undefined && m.teamB.score > m.teamA.score) ||
        (m.teamA.score === m.teamB.score && (m.teamB.penalties ?? 0) > (m.teamA.penalties ?? 0)));

    const teamAPlaceholder = isPlaceholderTeam(m.teamA);
    const teamBPlaceholder = isPlaceholderTeam(m.teamB);

    const isGrandFinalMatch = (m.round || '').toLowerCase().includes('grand final');
    const isThirdPlaceMatch = (m.round || '').toLowerCase().includes('juara 3');

    // Next match target resolution
    const nextMatch = m.nextMatchId ? knockoutMatchMap.get(m.nextMatchId) : null;

    return (
      <div
        key={m.id}
        className={`rounded-2xl transition-all duration-200 overflow-hidden ${
          isGrandFinalMatch
            ? isLight
              ? 'bg-gradient-to-b from-amber-50 to-white border-2 border-amber-400 shadow-lg shadow-amber-200/50'
              : 'bg-gradient-to-b from-amber-950/40 via-slate-900/90 to-slate-950 border-2 border-amber-500/60 shadow-xl shadow-amber-500/10'
            : isLight
            ? 'bg-white border border-slate-200 hover:border-slate-300 shadow-sm'
            : 'bg-slate-900/70 border border-white/10 hover:border-white/20 shadow-md'
        }`}
      >
        {/* Header Laga */}
        <div
          className={`px-3.5 py-2.5 flex items-center justify-between text-[11px] border-b ${
            isLight ? 'border-slate-100 bg-slate-50/70' : 'border-white/5 bg-slate-950/40'
          }`}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className={`font-extrabold truncate ${
                isGrandFinalMatch ? 'text-amber-400' : isLight ? 'text-slate-700' : 'text-slate-300'
              }`}
            >
              {m.round}
            </span>
          </div>
          <div className="shrink-0 flex items-center gap-1.5">
            {m.status === 'LIVE' && (
              <span className="px-2 py-0.5 rounded-full bg-red-600 text-white font-black text-[10px] animate-pulse flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-white" />
                LIVE {m.liveMinute ? `${m.liveMinute}'` : ''}
              </span>
            )}
            {m.status === 'FINISHED' && (
              <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-bold text-[10px]">
                SELESAI
              </span>
            )}
            {m.status === 'UPCOMING' && (
              <span className={`text-[10px] font-semibold flex items-center gap-1 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                <Clock className="w-3 h-3 opacity-60" />
                {m.date ? `${m.date.slice(5)} ` : ''}{m.time || 'TBD'}
              </span>
            )}
          </div>
        </div>

        {/* Body Laga (Tim A & Tim B) */}
        <div className="p-3 space-y-2">
          {/* Row Tim A */}
          <div
            className={`flex items-center justify-between p-2 rounded-xl transition ${
              isTeamAWinner
                ? isLight
                  ? 'bg-emerald-50/90 border border-emerald-200'
                  : 'bg-emerald-950/40 border border-emerald-500/30'
                : isLight
                ? 'bg-slate-50 border border-transparent'
                : 'bg-slate-950/50 border border-white/5'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
              <div
                className={`w-7 h-7 rounded-lg overflow-hidden shrink-0 flex items-center justify-center p-0.5 border ${
                  isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-white/10'
                }`}
              >
                {getTeamLogo(m.teamA.name, m.teamA.logo) ? (
                  <img
                    loading="lazy"
                    src={getTeamLogo(m.teamA.name, m.teamA.logo)}
                    alt={m.teamA.name}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <Shield className={`w-3.5 h-3.5 ${teamAPlaceholder ? 'text-slate-500' : 'text-amber-400'}`} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <span
                  className={`block text-xs truncate ${
                    teamAPlaceholder
                      ? isLight
                        ? 'text-slate-400 italic font-medium'
                        : 'text-slate-400 italic font-medium'
                      : isLight
                      ? 'text-slate-800 font-extrabold'
                      : 'text-white font-extrabold'
                  }`}
                >
                  {m.teamA.name || 'Belum Ada Tim'}
                </span>
                {m.teamA.institution && !teamAPlaceholder && (
                  <span className={`block text-[10px] truncate ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
                    {m.teamA.institution}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {m.teamA.penalties !== undefined && m.status === 'FINISHED' && (
                <span className="text-[10px] font-bold text-slate-400 mr-0.5">
                  (P:{m.teamA.penalties})
                </span>
              )}
              <span
                className={`min-w-6 text-center text-sm font-black px-1.5 py-0.5 rounded ${
                  m.status === 'UPCOMING'
                    ? isLight
                      ? 'text-slate-300'
                      : 'text-slate-600'
                    : isTeamAWinner
                    ? 'text-emerald-400 font-black'
                    : isLight
                    ? 'text-slate-700'
                    : 'text-slate-300'
                }`}
              >
                {m.status === 'UPCOMING' ? '-' : (m.teamA.score ?? 0)}
              </span>
              {isTeamAWinner && (
                <span className="text-emerald-400 text-xs font-black">✓</span>
              )}
            </div>
          </div>

          {/* Row Tim B */}
          <div
            className={`flex items-center justify-between p-2 rounded-xl transition ${
              isTeamBWinner
                ? isLight
                  ? 'bg-emerald-50/90 border border-emerald-200'
                  : 'bg-emerald-950/40 border border-emerald-500/30'
                : isLight
                ? 'bg-slate-50 border border-transparent'
                : 'bg-slate-950/50 border border-white/5'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
              <div
                className={`w-7 h-7 rounded-lg overflow-hidden shrink-0 flex items-center justify-center p-0.5 border ${
                  isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-white/10'
                }`}
              >
                {getTeamLogo(m.teamB.name, m.teamB.logo) ? (
                  <img
                    loading="lazy"
                    src={getTeamLogo(m.teamB.name, m.teamB.logo)}
                    alt={m.teamB.name}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <Shield className={`w-3.5 h-3.5 ${teamBPlaceholder ? 'text-slate-500' : 'text-blue-400'}`} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <span
                  className={`block text-xs truncate ${
                    teamBPlaceholder
                      ? isLight
                        ? 'text-slate-400 italic font-medium'
                        : 'text-slate-400 italic font-medium'
                      : isLight
                      ? 'text-slate-800 font-extrabold'
                      : 'text-white font-extrabold'
                  }`}
                >
                  {m.teamB.name || 'Belum Ada Tim'}
                </span>
                {m.teamB.institution && !teamBPlaceholder && (
                  <span className={`block text-[10px] truncate ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
                    {m.teamB.institution}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {m.teamB.penalties !== undefined && m.status === 'FINISHED' && (
                <span className="text-[10px] font-bold text-slate-400 mr-0.5">
                  (P:{m.teamB.penalties})
                </span>
              )}
              <span
                className={`min-w-6 text-center text-sm font-black px-1.5 py-0.5 rounded ${
                  m.status === 'UPCOMING'
                    ? isLight
                      ? 'text-slate-300'
                      : 'text-slate-600'
                    : isTeamBWinner
                    ? 'text-emerald-400 font-black'
                    : isLight
                    ? 'text-slate-700'
                    : 'text-slate-300'
                }`}
              >
                {m.status === 'UPCOMING' ? '-' : (m.teamB.score ?? 0)}
              </span>
              {isTeamBWinner && (
                <span className="text-emerald-400 text-xs font-black">✓</span>
              )}
            </div>
          </div>
        </div>

        {/* Footer Info Laga / Alur Lolos */}
        <div
          className={`px-3 py-2 flex items-center justify-between text-[10px] border-t ${
            isLight ? 'border-slate-100 bg-slate-50/50' : 'border-white/5 bg-slate-950/30'
          }`}
        >
          <span className={`font-semibold shrink-0 ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
            {m.matchNumber ? `Match #${m.matchNumber}` : 'Sistem Gugur'}
          </span>

          {m.status === 'FINISHED' ? (
            <span className="text-emerald-400 font-bold flex items-center gap-1 truncate">
              <Trophy className="w-3 h-3 text-emerald-400 shrink-0" />
              <span className="truncate">
                {isTeamAWinner ? m.teamA.name : isTeamBWinner ? m.teamB.name : 'Selesai'}
              </span>
            </span>
          ) : nextMatch ? (
            <span className={`font-medium flex items-center gap-1 truncate ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              <span>Menuju</span>
              <span className="font-bold text-amber-400 truncate">{nextMatch.round}</span>
            </span>
          ) : isGrandFinalMatch ? (
            <span className="text-amber-400 font-bold flex items-center gap-1">
              <Trophy className="w-3 h-3 text-amber-400" />
              <span>Perebutan Juara</span>
            </span>
          ) : isThirdPlaceMatch ? (
            <span className="text-amber-300 font-semibold flex items-center gap-1">
              <span>Perebutan Juara 3</span>
            </span>
          ) : (
            <span className={`text-[10px] ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
              Sistem Gugur
            </span>
          )}
        </div>
      </div>
    );
  };

  // Safe Loading flag: automatically stops after 5s watchdog
  const isLoading = (isInitialLoading || isSyncingWithServer || isRetrying) && !syncTimedOut;

  return (
    <div
      className={`relative min-h-screen w-full ${
        theme === 'light' ? 'bg-slate-50 text-slate-900' : 'bg-[#060a12] text-slate-100'
      } flex flex-col font-sans selection:bg-red-600 selection:text-white overflow-x-hidden transition-colors duration-200`}
    >
      {/* ========================================================================= */}
      {/* 0. OFFICIAL WABUP CUP CENTER BACKGROUND LOGO                              */}
      {/* ========================================================================= */}
      <div className="fixed inset-0 pointer-events-none flex items-center justify-center z-0 overflow-hidden select-none">
        <div className="w-[320px] sm:w-[480px] md:w-[620px] lg:w-[720px] max-w-[85vw] max-h-[85vh] aspect-[500/620] opacity-15 dark:opacity-20 transition-opacity duration-300">
          {config.wabupLogoUrl ? (
            <img loading="lazy"
              src={config.wabupLogoUrl}
              alt="Wabup Cup Center Background"
              className="w-full h-full object-contain filter drop-shadow-[0_20px_50px_rgba(220,38,38,0.25)]"
            />
          ) : (
            <WabupCupLogo className="w-full h-full object-contain filter drop-shadow-[0_20px_50px_rgba(220,38,38,0.25)]" />
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* LUXURY FULL-WIDTH RED WAVES & RADIAL GLOW BACKGROUND (Anti-Crop)         */}
      {/* ========================================================================= */}
      <div className="fixed inset-0 w-full h-full pointer-events-none z-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-[650px] h-[650px] bg-red-700/15 rounded-full blur-[140px]" />
        <div className="absolute top-1/3 -left-32 w-[550px] h-[550px] bg-red-600/10 rounded-full blur-[160px]" />
        <div className="absolute -bottom-20 right-1/4 w-[750px] h-[550px] bg-amber-600/10 rounded-full blur-[150px]" />

        <svg
          className="absolute inset-0 w-full h-full object-cover opacity-80"
          preserveAspectRatio="none"
          viewBox="0 0 1440 900"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="waveGrad1" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#991b1b" stopOpacity="0.8" />
              <stop offset="35%" stopColor="#ef4444" stopOpacity="0.85" />
              <stop offset="70%" stopColor="#b91c1c" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#7f1d1d" stopOpacity="0.05" />
            </linearGradient>
            <linearGradient id="waveGrad2" x1="0%" y1="80%" x2="100%" y2="20%">
              <stop offset="0%" stopColor="#b91c1c" stopOpacity="0.35" />
              <stop offset="50%" stopColor="#f87171" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#991b1b" stopOpacity="0.1" />
            </linearGradient>
          </defs>
          <path
            d="M-100,550 C300,750 650,420 1000,680 C1250,850 1450,720 1600,620 L1600,900 L-100,900 Z"
            fill="url(#waveGrad1)"
          />
          <path
            d="M-50,650 C400,500 800,820 1200,600 C1380,500 1500,580 1600,650 L1600,900 L-50,900 Z"
            fill="url(#waveGrad2)"
          />
        </svg>
      </div>

      {/* ========================================================================= */}
      {/* 1. TOP HEADER & RESPONSIVE FLEX NAVIGATION TABS (AUTO-HIDE ON SCROLL)    */}
      {/* ========================================================================= */}
      <header
        ref={headerRef}
        className={`fixed top-0 left-0 right-0 z-50 w-full backdrop-blur-2xl transition-all duration-300 ease-in-out ${
          isNavVisible
            ? 'translate-y-0 opacity-100 pointer-events-auto'
            : '-translate-y-full opacity-0 pointer-events-none'
        } ${
          theme === 'light'
            ? 'bg-white/70 border-b border-slate-200/60 shadow-sm text-slate-900'
            : 'bg-slate-950/70 border-b border-white/10 shadow-lg shadow-black/50 text-white'
        }`}
      >
        <div className="w-full max-w-[1440px] mx-auto px-3 sm:px-6 lg:px-8 min-h-[3.5rem] sm:min-h-[4rem] lg:min-h-[4.5rem] py-1.5 sm:py-2 lg:py-2.5 flex items-center justify-between gap-2 sm:gap-4">
          
          {/* BRAND LOGO & 2026 BADGE */}
          <div className="flex items-center space-x-2 sm:space-x-3 shrink-0 min-w-0">
            <div className="relative flex items-center justify-center h-9 sm:h-11 w-auto max-w-[38px] sm:max-w-[48px] shrink-0">
              {config.wabupLogoUrl ? (
                <img loading="lazy"
                  src={config.wabupLogoUrl}
                  alt="Logo Wabup Cup"
                  className="h-9 sm:h-11 w-auto max-w-[36px] sm:max-w-[44px] object-contain drop-shadow-[0_4px_12px_rgba(220,38,38,0.45)]"
                />
              ) : (
                <WabupCupLogo className="h-9 sm:h-11 w-auto max-w-[36px] sm:max-w-[44px] object-contain drop-shadow-[0_4px_12px_rgba(220,38,38,0.45)]" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-1.5 sm:space-x-2">
                <span
                  className={`text-sm sm:text-lg font-black tracking-tight ${
                    theme === 'light' ? 'text-slate-900' : 'text-white'
                  } uppercase truncate`}
                >
                  {config.name ? config.name.replace(/\s+/g, '') : 'WABUPCUP'}
                </span>
                <span className="px-1.5 sm:px-2 py-0.5 rounded-full bg-red-600 text-white text-[9px] sm:text-[10px] font-black uppercase tracking-wider shadow-sm shadow-red-600/50 flex items-center shrink-0">
                  2026
                </span>
              </div>
              <p
                className={`text-[9px] sm:text-[11px] font-semibold ${
                  theme === 'light' ? 'text-slate-500' : 'text-slate-400'
                } tracking-wider uppercase truncate`}
              >
                LEAGUE STANDINGS &amp; MATCHES
              </p>
            </div>
          </div>

          {/* MAIN NAVIGATION PILL TABS */}
          <nav
            className={`hidden lg:flex items-center ${
              theme === 'light'
                ? 'bg-slate-100/90 border-slate-300'
                : 'bg-slate-900/90 border-white/10'
            } p-1.5 rounded-full border shadow-inner`}
          >
            <button
              onClick={onBackToHome}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold ${
                theme === 'light' ? 'text-slate-700 hover:text-slate-900' : 'text-slate-300 hover:text-white'
              } transition-all cursor-pointer`}
            >
              Home
            </button>

            {isTabJadwalVisible && (
              <button
                onClick={() => setActiveTab('JADWAL')}
                className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer ${
                  activeTab === 'JADWAL'
                    ? 'bg-red-600 text-white shadow-md shadow-red-600/40'
                    : theme === 'light'
                    ? 'text-slate-700 hover:text-slate-900'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Jadwal &amp; Hasil</span>
              </button>
            )}

            {isTabKlasemenVisible && (
              <button
                onClick={() => setActiveTab('KLASEMEN')}
                className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer ${
                  activeTab === 'KLASEMEN'
                    ? 'bg-red-600 text-white shadow-md shadow-red-600/40'
                    : theme === 'light'
                    ? 'text-slate-700 hover:text-slate-900'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Trophy className="w-3.5 h-3.5" />
                <span>Klasemen</span>
              </button>
            )}

            {isTabTopScoreVisible && (
              <button
                onClick={() => setActiveTab('TOPSKOR')}
                className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer ${
                  activeTab === 'TOPSKOR'
                    ? 'bg-red-600 text-white shadow-md shadow-red-600/40'
                    : theme === 'light'
                    ? 'text-slate-700 hover:text-slate-900'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Flame className="w-3.5 h-3.5" />
                <span>Top Skor &amp; Kartu</span>
              </button>
            )}

            {isTabKnockoutVisible && (
              <button
                onClick={() => setActiveTab('KNOCKOUT')}
                className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer ${
                  activeTab === 'KNOCKOUT'
                    ? 'bg-red-600 text-white shadow-md shadow-red-600/40'
                    : theme === 'light'
                    ? 'text-slate-700 hover:text-slate-900'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Bagan Knockout</span>
              </button>
            )}
          </nav>

          {/* RIGHT ACTION BUTTONS */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* THEME TOGGLE BUTTON (DARK / LIGHT SYNCED WITH LANDING & CMS ADMIN) */}
            <button
              type="button"
              onClick={toggleTheme}
              id="btn-standalone-theme-toggle"
              aria-label={theme === 'dark' ? 'Ganti ke Mode Terang' : 'Ganti ke Mode Gelap'}
              title={theme === 'dark' ? 'Ganti ke Mode Terang (Light Mode)' : 'Ganti ke Mode Gelap (Dark Mode)'}
              className={`p-1.5 sm:p-2 sm:px-3 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer shadow-sm active:scale-95 ${
                theme === 'light'
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300'
                  : 'bg-slate-900/80 hover:bg-slate-800 text-slate-200 border border-slate-700/70'
              }`}
            >
              {theme === 'dark' ? (
                <>
                  <Sun className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400" />
                  <span className="hidden sm:inline">Terang</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-indigo-500" />
                  <span className="hidden sm:inline">Gelap</span>
                </>
              )}
            </button>

            <button
              onClick={onBackToHome}
              className={`p-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer shadow-sm ${
                theme === 'light'
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300'
                  : 'text-slate-200 hover:text-white bg-slate-900/80 hover:bg-slate-800 border border-slate-700/70'
              }`}
              title="Kembali ke Beranda Utama"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-slate-400" />
              <span className="hidden sm:inline">Beranda Utama</span>
            </button>

            {onOpenAdmin && (
              <button
                onClick={onOpenAdmin}
                className="p-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs font-bold text-red-300 hover:text-white bg-red-950/40 hover:bg-red-900/60 border border-red-800/60 transition flex items-center space-x-1.5 cursor-pointer shadow-sm shadow-red-950/30"
                title="Buka Panel Panitia & Manajemen Skor"
              >
                <Shield className="w-3.5 h-3.5 text-red-400" />
                <span className="hidden sm:inline">Panel Panitia</span>
              </button>
            )}
          </div>
        </div>

        {/* MOBILE & TABLET SUB-NAVIGATION BAR (AUTO-WRAP) */}
        <div
          className={`lg:hidden flex items-center px-3 py-1.5 ${
            theme === 'light'
              ? 'bg-white/95 border-t border-slate-200'
              : 'bg-slate-950/95 border-t border-white/5'
          } overflow-x-auto gap-1.5 scrollbar-thin`}
        >
          {isTabKlasemenVisible && (
            <button
              onClick={() => setActiveTab('KLASEMEN')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 flex items-center space-x-1 ${
                activeTab === 'KLASEMEN'
                  ? 'bg-red-600 text-white shadow-sm shadow-red-600/40'
                  : theme === 'light'
                  ? 'text-slate-600 hover:text-slate-900'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Trophy className="w-3.5 h-3.5" />
              <span>Klasemen</span>
            </button>
          )}

          {isTabJadwalVisible && (
            <button
              onClick={() => setActiveTab('JADWAL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 flex items-center space-x-1 ${
                activeTab === 'JADWAL'
                  ? 'bg-red-600 text-white shadow-sm shadow-red-600/40'
                  : theme === 'light'
                  ? 'text-slate-600 hover:text-slate-900'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Jadwal &amp; Hasil</span>
            </button>
          )}

          {isTabTopScoreVisible && (
            <button
              onClick={() => setActiveTab('TOPSKOR')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 flex items-center space-x-1 ${
                activeTab === 'TOPSKOR'
                  ? 'bg-red-600 text-white shadow-sm shadow-red-600/40'
                  : theme === 'light'
                  ? 'text-slate-600 hover:text-slate-900'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Flame className="w-3.5 h-3.5" />
              <span>Top Skor</span>
            </button>
          )}

          {isTabKnockoutVisible && (
            <button
              onClick={() => setActiveTab('KNOCKOUT')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 flex items-center space-x-1 ${
                activeTab === 'KNOCKOUT'
                  ? 'bg-red-600 text-white shadow-sm shadow-red-600/40'
                  : theme === 'light'
                  ? 'text-slate-600 hover:text-slate-900'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Bagan Knockout</span>
            </button>
          )}
        </div>
      </header>

      {/* Dynamic spacer matching the exact rendered height of the fixed navigation */}
      <div
        style={{ height: headerHeight > 0 ? `${headerHeight}px` : undefined }}
        className="h-[7.5rem] sm:h-[6.5rem] lg:h-[4.5rem] w-full shrink-0 pointer-events-none"
      />

      {/* ========================================================================= */}
      {/* 2. SECONDARY FILTER BAR: KATEGORI & ACTION DOCK                           */}
      {/* ========================================================================= */}
      <section className="relative z-10 w-full max-w-[1440px] mx-auto px-3 sm:px-6 lg:px-8 pt-4 sm:pt-6 pb-2">
        <div className="backdrop-blur-2xl bg-gradient-to-r from-slate-900/85 via-slate-900/70 to-slate-950/85 border border-white/10 rounded-2xl p-2.5 sm:p-3 shadow-2xl shadow-black/50 flex flex-col lg:flex-row items-center justify-between gap-3.5">
          
          {/* CATEGORY GLASS SCROLLER CONTAINER */}
          <div className="relative flex items-center w-full lg:w-auto min-w-0 flex-1">
            <div className="flex items-center space-x-1.5 text-slate-400 text-xs font-black uppercase tracking-wider pl-1 pr-2.5 shrink-0 select-none">
              <span className="w-6 h-6 rounded-lg bg-red-950/70 border border-red-700/50 flex items-center justify-center text-red-500 shadow-sm">
                <Filter className="w-3.5 h-3.5" />
              </span>
              <span className="hidden sm:inline">KATEGORI:</span>
            </div>

            {/* Left Glass Scroll Arrow */}
            {canScrollLeft && (
              <button
                onClick={() => scrollCategories('left')}
                className="absolute left-10 sm:left-24 z-20 w-7 h-7 rounded-full bg-slate-900/95 border border-white/20 text-white shadow-xl backdrop-blur-md flex items-center justify-center hover:bg-red-600 transition cursor-pointer"
                title="Geser Kategori ke Kiri"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}

            {/* Glass Fade Left Overlay */}
            {canScrollLeft && (
              <div className="pointer-events-none absolute left-8 sm:left-20 top-0 bottom-0 w-8 bg-gradient-to-r from-slate-900 via-slate-900/60 to-transparent z-10" />
            )}

            {/* Glass Scrollable Pills */}
            <div
              ref={categoryScrollRef}
              onScroll={checkCategoryScroll}
              className="flex items-center space-x-2 overflow-x-auto w-full py-1 px-1 scroll-smooth glass-scrollbar"
            >
              {categories.map(cat => {
                const isActive = selectedCat === cat.id;

                return (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCat(cat.id)}
                    className={`px-4 py-2 rounded-xl text-xs font-black transition-all shrink-0 flex items-center space-x-2 cursor-pointer duration-200 ${
                      isActive
                        ? 'bg-gradient-to-r from-red-600 via-red-600 to-red-700 text-white shadow-lg shadow-red-600/40 ring-1 ring-red-400/50 border border-red-400/40 scale-[1.02]'
                        : 'bg-white/[0.04] hover:bg-white/[0.09] text-slate-300 hover:text-white border border-white/10 hover:border-white/25 backdrop-blur-md shadow-sm'
                    }`}
                  >
                    <span className="tracking-wide">{cleanCategoryName(cat.name)}</span>
                  </button>
                );
              })}
            </div>

            {/* Glass Fade Right Overlay */}
            {canScrollRight && (
              <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-slate-900 via-slate-900/60 to-transparent z-10" />
            )}

            {/* Right Glass Scroll Arrow */}
            {canScrollRight && (
              <button
                onClick={() => scrollCategories('right')}
                className="absolute right-0 z-20 w-7 h-7 rounded-full bg-slate-900/95 border border-white/20 text-white shadow-xl backdrop-blur-md flex items-center justify-center hover:bg-red-600 transition cursor-pointer"
                title="Geser Kategori ke Kanan"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* TROPHY BADGE & ACTIONS (RIGHT DOCK) */}
          <div className="flex items-center flex-wrap gap-2 shrink-0 self-center lg:self-auto pt-2.5 lg:pt-0 border-t lg:border-t-0 border-white/10 lg:border-white/5 w-full lg:w-auto justify-center lg:justify-end">
            <div className="flex items-center space-x-2 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-red-950/60 to-red-900/40 border border-red-800/40 text-xs font-bold text-red-200 shadow-sm">
              <div className="w-4 h-4 shrink-0 flex items-center justify-center">
                {config.wabupLogoUrl ? (
                  <img loading="lazy" src={config.wabupLogoUrl} alt="Logo Wabup Cup" className="w-4 h-4 object-contain" />
                ) : (
                  <WabupCupLogo className="w-4 h-4 object-contain" />
                )}
              </div>
              <span>Piala Wakil Bupati Cup</span>
            </div>

            {/* Manual Sync Button with subtle spinner & label */}
            <button
              onClick={handleManualRefresh}
              disabled={isLoading}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-950/70 hover:bg-slate-800 border border-white/10 text-slate-300 hover:text-white transition cursor-pointer shadow-sm hover:border-white/20 active:scale-95 text-xs font-semibold"
              title="Perbarui data klasemen & jadwal"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-red-500' : ''}`} />
              <span className="hidden sm:inline">Perbarui</span>
            </button>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 3. MAIN CONTENT: RESPONSIVE EXPANDED CONTAINER (ANTI-MENGEIL)            */}
      {/* ========================================================================= */}
      <main className="relative z-10 w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-5 flex-1">
        
        {/* SERVER / NETWORK ERROR BANNER */}
        {hasSyncError && (
          <div className="mb-6 p-4 rounded-2xl bg-red-950/50 border border-red-800/60 backdrop-blur-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xl">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-red-900/50 border border-red-500/40 flex items-center justify-center text-red-400 shrink-0">
                <WifiOff className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-white">Gagal memuat data dari server</p>
                <p className="text-xs text-red-300/80">Silakan periksa koneksi internet Anda atau coba lagi nanti.</p>
              </div>
            </div>
            <button
              onClick={handleManualRefresh}
              disabled={isLoading}
              className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold flex items-center space-x-1.5 transition shadow-md shadow-red-600/40 shrink-0 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Coba Lagi</span>
            </button>
          </div>
        )}

        {/* ======================================================================= */}
        {/* TAB 1: JADWAL & HASIL LENGKAP                                           */}
        {/* ======================================================================= */}
        {activeTab === 'JADWAL' && (
          <div className="space-y-6">
            {/* Header Card with Filters */}
            <div className="backdrop-blur-2xl bg-gradient-to-b from-slate-900/80 to-slate-950/80 border border-white/10 rounded-2xl p-4 sm:p-5 shadow-2xl shadow-black/50">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-white/10">
                <div>
                  <h2 className="text-base sm:text-lg lg:text-xl font-black text-white flex items-start gap-2.5 tracking-wide">
                    <Calendar className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                    <div>
                      <span>JADWAL &amp; HASIL LENGKAP</span>
                      <span className="block text-xs sm:text-sm font-extrabold text-red-400 mt-0.5 uppercase">
                        {cleanCategoryName(currentCatDetail.name)}
                      </span>
                    </div>
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Format pertandingan terbagi atas <span className="text-red-400 font-semibold">Fase Penyisihan Grup</span> {catGroups.length > 0 ? `(${catGroups.length} Grup)` : '(Semua Grup)'} dan <span className="text-amber-400 font-semibold">Babak Gugur (Knockout)</span>.
                  </p>
                </div>

                {/* View Mode Toggle */}
                <div className="flex items-center space-x-2 self-end md:self-auto shrink-0">
                  <span className="text-xs font-black text-slate-400 uppercase mr-1">TAMPILAN:</span>
                  <div className="bg-slate-950/85 p-1 rounded-xl border border-white/10 flex items-center shadow-inner">
                    <button
                      onClick={() => setViewMode('PER_GRUP')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer ${
                        viewMode === 'PER_GRUP' ? 'bg-red-600 text-white shadow-md shadow-red-600/40' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <Layers className="w-3.5 h-3.5" />
                      <span>Per Grup</span>
                    </button>
                    <button
                      onClick={() => setViewMode('ALL_TIMELINE')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer ${
                        viewMode === 'ALL_TIMELINE' ? 'bg-red-600 text-white shadow-md shadow-red-600/40' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      <span>Semua / Garis Waktu</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Filter Sub-row */}
              <div className="pt-4 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
                {/* Group Filters */}
                <div className="flex items-center space-x-1.5 overflow-x-auto w-full lg:w-auto pb-1 lg:pb-0 glass-scrollbar">
                  <span className="text-xs font-bold text-slate-400 mr-1 shrink-0">Filter Grup:</span>
                  <button
                    onClick={() => setSelectedGroup('ALL')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition cursor-pointer ${
                      selectedGroup === 'ALL'
                        ? 'bg-red-600 text-white shadow-md shadow-red-600/30'
                        : 'bg-slate-950/60 text-slate-400 hover:text-white border border-white/10 hover:bg-slate-800'
                    }`}
                  >
                    Semua Grup ({catGroups.length})
                  </button>

                  <button
                    onClick={() => setSelectedGroup('KNOCKOUT')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition flex items-center space-x-1 cursor-pointer ${
                      selectedGroup === 'KNOCKOUT'
                        ? 'bg-red-600 text-white shadow-md shadow-red-600/30'
                        : 'bg-slate-950/60 text-slate-400 hover:text-white border border-white/10 hover:bg-slate-800'
                    }`}
                  >
                    <Zap className="w-3 h-3 text-amber-400" />
                    <span>Fase Gugur (Knockout)</span>
                  </button>

                  {catGroups.map(grp => (
                    <button
                      key={grp.groupName}
                      onClick={() => setSelectedGroup(grp.groupName)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition cursor-pointer ${
                        selectedGroup === grp.groupName
                          ? 'bg-red-600 text-white shadow-md shadow-red-600/30'
                          : 'bg-slate-950/60 text-slate-400 hover:text-white border border-white/10 hover:bg-slate-800'
                      }`}
                    >
                      {grp.groupName}
                    </button>
                  ))}
                </div>

                {/* Status Pills & Search Input */}
                <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto justify-between lg:justify-end">
                  <div className="flex items-center space-x-1 bg-slate-950/85 p-1 rounded-xl border border-white/10 shadow-inner">
                    <button
                      onClick={() => setSelectedStatus('ALL')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                        selectedStatus === 'ALL' ? 'bg-red-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Semua Status
                    </button>
                    <button
                      onClick={() => setSelectedStatus('LIVE')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer ${
                        selectedStatus === 'LIVE' ? 'bg-red-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-ping" />
                      <span>Live</span>
                    </button>
                    <button
                      onClick={() => setSelectedStatus('FINISHED')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                        selectedStatus === 'FINISHED' ? 'bg-red-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Selesai
                    </button>
                    <button
                      onClick={() => setSelectedStatus('UPCOMING')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                        selectedStatus === 'UPCOMING' ? 'bg-red-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Mendatang
                    </button>
                  </div>

                  <div className="relative w-full sm:w-60">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Cari tim di jadwal..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-950/85 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-red-500/80 focus:ring-1 focus:ring-red-500/30 transition"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Matches List or Smooth Lazy Skeletons or Empty State */}
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map(n => (
                  <div
                    key={n}
                    className="backdrop-blur-xl bg-slate-900/40 border border-white/10 rounded-2xl p-6 animate-pulse"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="h-4 bg-white/10 rounded-md w-32" />
                      <div className="h-4 bg-white/10 rounded-md w-24" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                      <div className="h-10 bg-white/5 rounded-xl" />
                      <div className="h-8 bg-white/10 rounded-lg mx-auto w-20" />
                      <div className="h-10 bg-white/5 rounded-xl" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredMatches.length === 0 ? (
              <div className="backdrop-blur-2xl bg-gradient-to-b from-slate-900/70 via-slate-900/50 to-slate-950/70 border border-white/10 rounded-3xl p-12 sm:p-16 text-center shadow-2xl shadow-black/50 min-h-[340px] flex flex-col items-center justify-center">
                <div className="w-16 h-16 rounded-2xl bg-slate-950/60 border border-white/10 flex items-center justify-center mx-auto mb-4 text-slate-400 shadow-inner">
                  <Calendar className="w-8 h-8 opacity-70 text-slate-400" strokeWidth={1.5} />
                </div>
                <h3 className="text-lg sm:text-xl font-black text-white">Belum Ada Jadwal Pertandingan</h3>
                <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto mt-1.5 leading-relaxed">
                  Belum ada jadwal pertandingan yang diterbitkan untuk kategori ini. Silakan pantau pembaruan jadwal berkala dari panitia pelaksana turnamen.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3.5">
                {filteredMatches.map(m => (
                  <div
                    key={m.id}
                    className="p-4 sm:p-5 rounded-2xl bg-slate-900/60 border border-white/10 hover:border-red-500/40 transition shadow-lg"
                  >
                    <div className="flex flex-wrap items-center justify-between text-xs text-slate-400 mb-3 gap-2 pb-2.5 border-b border-white/5">
                      <div className="flex items-center space-x-2">
                        <span className="font-extrabold text-white px-2 py-0.5 rounded bg-slate-800 border border-white/10 text-[11px]">
                          {m.round}
                        </span>
                        {m.group && (
                          <span className="font-bold text-red-400 bg-red-950/40 border border-red-800/40 px-2 py-0.5 rounded text-[10px]">
                            {m.group}
                          </span>
                        )}
                        <span className="text-slate-400">• {m.pitch || 'Lapangan Utama'}</span>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        <span>{m.date} {m.time} WIB</span>
                        {m.status === 'LIVE' && (
                          <span className="px-2 py-0.5 rounded-full bg-red-600 text-white font-black text-[10px] animate-pulse ml-2">
                            LIVE {m.liveMinute ? `${m.liveMinute}'` : ''}
                          </span>
                        )}
                        {m.status === 'FINISHED' && (
                          <span className="px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800/40 font-bold text-[10px] ml-2">
                            FULL TIME
                          </span>
                        )}
                      </div>
                    </div>

                    {/* MODE MOBILE (HP): Logo di atas, Nama Tim Bold di bawah logo, Skor Horisontal Simetris */}
                    <div className="flex sm:hidden items-center justify-between gap-2 py-2">
                      {/* Tim A (Kiri): Logo di atas, Nama tim bold di bawah */}
                      <div className="flex-1 flex flex-col items-center text-center min-w-0">
                        <div className="w-12 h-12 rounded-xl bg-slate-800/90 border border-white/10 flex items-center justify-center overflow-hidden shrink-0 shadow-sm p-1 mb-1.5">
                          {getTeamLogo(m.teamA.name, m.teamA.logo) ? (
                            <img loading="lazy"
                              src={getTeamLogo(m.teamA.name, m.teamA.logo)}
                              alt={m.teamA.name}
                              className="w-full h-full object-contain"
                            />
                          ) : (
                            <Shield className="w-5 h-5 text-red-400" />
                          )}
                        </div>
                        <span className="font-extrabold text-xs text-white leading-tight break-words text-center line-clamp-2 px-0.5">
                          {m.teamA.name}
                        </span>
                      </div>

                      {/* Skor Horisontal Simetris / VS (Tengah) */}
                      <div className="shrink-0 flex flex-col items-center justify-center px-1">
                        {m.status === 'FINISHED' || m.status === 'LIVE' ? (
                          <div className="flex flex-col items-center">
                            <div className="inline-flex items-center justify-center space-x-2 px-3 py-1.5 rounded-xl bg-slate-950/90 border border-white/15 shadow-inner">
                              <span className="text-base font-black text-white font-mono">{m.teamA.score ?? 0}</span>
                              <span className="text-slate-400 font-bold">-</span>
                              <span className="text-base font-black text-white font-mono">{m.teamB.score ?? 0}</span>
                            </div>
                            {m.status === 'LIVE' ? (
                              <span className="mt-1 px-1.5 py-0.5 rounded-full bg-red-600 text-white font-black text-[9px] animate-pulse">
                                LIVE {m.liveMinute ? `${m.liveMinute}'` : ''}
                              </span>
                            ) : (
                              <span className="mt-1 text-[9px] font-bold text-emerald-400 tracking-wider">
                                FT
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-col items-center">
                            <div className="inline-block px-3 py-1 rounded-lg bg-slate-950/70 border border-white/10 text-xs font-black text-amber-400">
                              VS
                            </div>
                            <span className="mt-1 text-[9px] font-bold text-slate-400 font-mono">
                              {m.time ? `${m.time} WIB` : 'TBA'}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Tim B (Kanan): Logo di atas, Nama tim bold di bawah */}
                      <div className="flex-1 flex flex-col items-center text-center min-w-0">
                        <div className="w-12 h-12 rounded-xl bg-slate-800/90 border border-white/10 flex items-center justify-center overflow-hidden shrink-0 shadow-sm p-1 mb-1.5">
                          {getTeamLogo(m.teamB.name, m.teamB.logo) ? (
                            <img loading="lazy"
                              src={getTeamLogo(m.teamB.name, m.teamB.logo)}
                              alt={m.teamB.name}
                              className="w-full h-full object-contain"
                            />
                          ) : (
                            <Shield className="w-5 h-5 text-blue-400" />
                          )}
                        </div>
                        <span className="font-extrabold text-xs text-white leading-tight break-words text-center line-clamp-2 px-0.5">
                          {m.teamB.name}
                        </span>
                      </div>
                    </div>

                    {/* MODE DESKTOP/TABLET (sm:grid) */}
                    <div className="hidden sm:grid grid-cols-12 gap-2 sm:gap-4 items-center">
                      {/* Tim A (Kiri) */}
                      <div className="col-span-5 flex items-center justify-end space-x-2 sm:space-x-3">
                        <div className="text-right min-w-0">
                          <span className="text-xs sm:text-sm md:text-base font-black text-white block leading-tight break-words">
                            {m.teamA.name}
                          </span>
                        </div>
                        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-slate-800/90 border border-white/10 flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
                          {getTeamLogo(m.teamA.name, m.teamA.logo) ? (
                            <img loading="lazy"
                              src={getTeamLogo(m.teamA.name, m.teamA.logo)}
                              alt={m.teamA.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <Shield className="w-4 h-4 sm:w-5 sm:h-5 text-red-400" />
                          )}
                        </div>
                      </div>

                      {/* Skor / VS (Tengah) */}
                      <div className="col-span-2 text-center py-1">
                        {m.status === 'FINISHED' || m.status === 'LIVE' ? (
                          <div className="inline-flex items-center space-x-1.5 sm:space-x-2.5 px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-xl bg-slate-950/90 border border-white/15 shadow-inner">
                            <span className="text-sm sm:text-base md:text-lg font-black text-white">{m.teamA.score ?? 0}</span>
                            <span className="text-slate-500 text-xs sm:text-sm font-bold">:</span>
                            <span className="text-sm sm:text-base md:text-lg font-black text-white">{m.teamB.score ?? 0}</span>
                          </div>
                        ) : (
                          <div className="inline-block px-2 sm:px-3 py-1 rounded-lg bg-slate-950/70 border border-white/10 text-[10px] sm:text-xs font-black text-amber-400">
                            VS
                          </div>
                        )}
                      </div>

                      {/* Tim B (Kanan) */}
                      <div className="col-span-5 flex items-center justify-start space-x-2 sm:space-x-3">
                        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-slate-800/90 border border-white/10 flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
                          {getTeamLogo(m.teamB.name, m.teamB.logo) ? (
                            <img loading="lazy"
                              src={getTeamLogo(m.teamB.name, m.teamB.logo)}
                              alt={m.teamB.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <Shield className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400" />
                          )}
                        </div>
                        <div className="text-left min-w-0">
                          <span className="text-xs sm:text-sm md:text-base font-black text-white block leading-tight break-words">
                            {m.teamB.name}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Events: Gol & Pelanggaran Tampil Berurutan di Bawah Sesuai Nama Tim */}
                    {m.events && m.events.length > 0 && (() => {
                      const eventsA = m.events.filter(ev => ev.team === 'A');
                      const eventsB = m.events.filter(ev => ev.team === 'B');
                      if (eventsA.length === 0 && eventsB.length === 0) return null;

                      return (
                        <div className="mt-3.5 pt-3 border-t border-white/5 grid grid-cols-12 gap-2 text-xs">
                          {/* Event Tim A (Tepat di bawah Tim A, rata kanan di layar sm ke atas) */}
                          <div className="col-span-6 sm:col-span-5 flex flex-col items-start sm:items-end space-y-1.5 pr-1">
                            {eventsA.map((ev, evIdx) => (
                              <div
                                key={evIdx}
                                className={`inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-lg border text-[10px] sm:text-[11px] font-bold ${
                                  ev.type === 'GOAL'
                                    ? 'bg-emerald-950/60 border-emerald-600/40 text-emerald-300'
                                    : ev.type === 'YELLOW'
                                    ? 'bg-amber-950/60 border-amber-600/40 text-amber-300'
                                    : 'bg-red-950/60 border-red-600/40 text-red-300'
                                }`}
                              >
                                <span>{ev.type === 'GOAL' ? '⚽' : ev.type === 'YELLOW' ? '🟨' : '🟥'}</span>
                                <span className="text-white truncate max-w-[95px] sm:max-w-[150px]">{ev.playerName}</span>
                                {ev.minute && <span className="opacity-75 font-mono text-[9px] sm:text-[10px]">({ev.minute}')</span>}
                              </div>
                            ))}
                          </div>

                          {/* Pembatas Tengah */}
                          <div className="hidden sm:flex sm:col-span-2 justify-center items-start pt-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-white/20" />
                          </div>

                          {/* Event Tim B (Tepat di bawah Tim B, rata kiri) */}
                          <div className="col-span-6 sm:col-span-5 flex flex-col items-end sm:items-start space-y-1.5 pl-1">
                            {eventsB.map((ev, evIdx) => (
                              <div
                                key={evIdx}
                                className={`inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-lg border text-[10px] sm:text-[11px] font-bold ${
                                  ev.type === 'GOAL'
                                    ? 'bg-emerald-950/60 border-emerald-600/40 text-emerald-300'
                                    : ev.type === 'YELLOW'
                                    ? 'bg-amber-950/60 border-amber-600/40 text-amber-300'
                                    : 'bg-red-950/60 border-red-600/40 text-red-300'
                                }`}
                              >
                                <span>{ev.type === 'GOAL' ? '⚽' : ev.type === 'YELLOW' ? '🟨' : '🟥'}</span>
                                <span className="text-white truncate max-w-[95px] sm:max-w-[150px]">{ev.playerName}</span>
                                {ev.minute && <span className="opacity-75 font-mono text-[9px] sm:text-[10px]">({ev.minute}')</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ======================================================================= */}
        {/* TAB 2: KLASEMEN (RESPONSIVE ASYMMETRIC GRID: MOBILE 1-COL, TABLET 2-COL, DESKTOP 12-COL) */}
        {/* ======================================================================= */}
        {activeTab === 'KLASEMEN' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* =================================================================== */}
            {/* LEFT COLUMN: SIDEBAR WIDGETS (TABLET: MD GRID-COLS-2/3, DESKTOP: LG COL-SPAN-4) */}
            {/* =================================================================== */}
            <div className="lg:col-span-4 order-2 lg:order-1">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-6">
                
                {/* WIDGET 1: TOP SKORER */}
                <div className="backdrop-blur-2xl bg-slate-900/60 border border-white/10 rounded-2xl p-5 shadow-2xl shadow-black/50">
                  <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
                    <div className="flex items-center space-x-2">
                      <div className="w-7 h-7 rounded-lg bg-red-950/60 border border-red-700/50 flex items-center justify-center text-red-500">
                        <Flame className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-black text-white tracking-wide uppercase">TOP SKORER</h3>
                        <p className="text-[10px] text-slate-400">{cleanCategoryName(currentCatDetail.name)}</p>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full bg-slate-800 text-[10px] font-bold text-slate-300">
                      GOL
                    </span>
                  </div>

                  {isLoading ? (
                    <div className="space-y-3 py-2 animate-pulse">
                      {[1, 2, 3].map(n => (
                        <div key={n} className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <div className="w-7 h-7 rounded-full bg-white/10" />
                            <div className="h-3 bg-white/10 rounded w-24" />
                          </div>
                          <div className="h-4 bg-white/10 rounded w-6" />
                        </div>
                      ))}
                    </div>
                  ) : topScorers.length === 0 ? (
                    <div className="py-8 text-center px-4">
                      <p className="text-xs text-slate-400 leading-relaxed">
                        Belum ada catatan gol untuk kategori {cleanCategoryName(currentCatDetail.name)}. Gol akan tercatat otomatis saat pertandingan live score berjalan.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {topScorers.slice(0, 5).map((p, idx) => (
                        <div
                          key={p.id}
                          className="flex items-center justify-between p-2 rounded-xl bg-slate-950/50 border border-white/5 hover:border-white/15 transition"
                        >
                          <div className="flex items-center space-x-2.5">
                            <div
                              className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ${
                                idx === 0
                                  ? 'bg-amber-500 text-slate-950'
                                  : idx === 1
                                  ? 'bg-slate-300 text-slate-950'
                                  : idx === 2
                                  ? 'bg-amber-700 text-white'
                                  : 'bg-slate-800 text-slate-400'
                              }`}
                            >
                              {idx + 1}
                            </div>
                            <div>
                              <p className="text-xs font-bold text-white truncate max-w-[130px]">{p.name}</p>
                              <p className="text-[10px] text-slate-400 truncate max-w-[130px]">{p.teamName}</p>
                            </div>
                          </div>
                          <span className="text-sm font-black text-red-400 px-2 py-0.5 rounded bg-red-950/40 border border-red-800/40">
                            {p.goals || 0}
                          </span>
                        </div>
                      ))}
                      <button
                        onClick={() => setActiveTab('TOPSKOR')}
                        className="w-full mt-2 pt-2 text-center text-[11px] font-bold text-red-400 hover:text-red-300 transition cursor-pointer"
                      >
                        Lihat Top Skor Lengkap &gt;
                      </button>
                    </div>
                  )}
                </div>

                {/* WIDGET 2: JADWAL MENDATANG */}
                <div className="backdrop-blur-2xl bg-slate-900/60 border border-white/10 rounded-2xl p-5 shadow-2xl shadow-black/50">
                  <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
                    <div className="flex items-center space-x-2">
                      <div className="w-7 h-7 rounded-lg bg-blue-950/60 border border-blue-700/50 flex items-center justify-center text-blue-400">
                        <Clock className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-black text-white tracking-wide uppercase">JADWAL MENDATANG</h3>
                        <p className="text-[10px] text-slate-400">{cleanCategoryName(currentCatDetail.name)}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setActiveTab('JADWAL')}
                      className="text-[11px] font-bold text-red-400 hover:text-red-300 transition cursor-pointer"
                    >
                      Lengkap &gt;
                    </button>
                  </div>

                  {isLoading ? (
                    <div className="space-y-3 py-2 animate-pulse">
                      {[1, 2].map(n => (
                        <div key={n} className="h-14 bg-white/5 rounded-xl" />
                      ))}
                    </div>
                  ) : upcomingMatches.length === 0 ? (
                    <div className="py-8 text-center px-4">
                      <p className="text-xs text-slate-400">Belum ada jadwal pertandingan mendatang.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {upcomingMatches.map(m => {
                        const logoA = getTeamLogo(m.teamA.name, m.teamA.logo);
                        const logoB = getTeamLogo(m.teamB.name, m.teamB.logo);
                        return (
                          <div
                            key={m.id}
                            className="p-3 rounded-xl bg-slate-950/65 border border-white/5 hover:border-white/15 transition text-xs flex flex-col space-y-2.5 shadow-md"
                          >
                            {/* Baris Atas: Babak & Tanggal / Jam Lengkap */}
                            <div className="flex flex-wrap items-center justify-between text-[10px] text-slate-400 gap-1.5 pb-1.5 border-b border-white/5">
                              <span className="font-bold text-slate-300 px-1.5 py-0.5 rounded bg-slate-800/80 border border-white/10">
                                {m.round}{m.group ? ` • ${m.group}` : ''}
                              </span>
                              <div className="flex items-center space-x-1.5 text-amber-400 font-bold">
                                <Calendar className="w-3 h-3 text-amber-500/90" />
                                <span>{m.date || 'TBA'}</span>
                                <span className="text-slate-600">•</span>
                                <Clock className="w-3 h-3 text-amber-500/90" />
                                <span>{m.time ? `${m.time} WIB` : 'TBA'}</span>
                              </div>
                            </div>

                            {/* MODE MOBILE (HP): Logo di atas, Nama Tim Bold di bawah logo, VS Horisontal Simetris */}
                            <div className="flex sm:hidden items-center justify-between gap-2 py-1">
                              {/* Tim A (Kiri): Logo di atas, Nama tim bold di bawah */}
                              <div className="flex-1 flex flex-col items-center text-center min-w-0">
                                <div className="w-10 h-10 rounded-lg bg-slate-800/90 border border-white/10 flex items-center justify-center overflow-hidden shrink-0 shadow-sm p-1 mb-1">
                                  {logoA ? (
                                    <img loading="lazy" src={logoA} alt={m.teamA.name} className="w-full h-full object-contain" />
                                  ) : (
                                    <Shield className="w-4 h-4 text-red-400" />
                                  )}
                                </div>
                                <span className="font-extrabold text-[11px] text-white leading-tight break-words text-center line-clamp-2 px-0.5">
                                  {m.teamA.name}
                                </span>
                              </div>

                              {/* VS Horisontal Simetris (Tengah) */}
                              <div className="shrink-0 flex flex-col items-center justify-center px-1">
                                <span className="px-2 py-0.5 rounded bg-slate-900 border border-white/10 text-[9px] font-black text-amber-400">
                                  VS
                                </span>
                              </div>

                              {/* Tim B (Kanan): Logo di atas, Nama tim bold di bawah */}
                              <div className="flex-1 flex flex-col items-center text-center min-w-0">
                                <div className="w-10 h-10 rounded-lg bg-slate-800/90 border border-white/10 flex items-center justify-center overflow-hidden shrink-0 shadow-sm p-1 mb-1">
                                  {logoB ? (
                                    <img loading="lazy" src={logoB} alt={m.teamB.name} className="w-full h-full object-contain" />
                                  ) : (
                                    <Shield className="w-4 h-4 text-blue-400" />
                                  )}
                                </div>
                                <span className="font-extrabold text-[11px] text-white leading-tight break-words text-center line-clamp-2 px-0.5">
                                  {m.teamB.name}
                                </span>
                              </div>
                            </div>

                            {/* MODE DESKTOP/TABLET (sm:grid) */}
                            <div className="hidden sm:grid grid-cols-12 gap-2 items-center">
                              {/* Tim A */}
                              <div className="col-span-5 flex items-center space-x-2 min-w-0">
                                <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-slate-800/90 border border-white/10 flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
                                  {logoA ? (
                                    <img loading="lazy" src={logoA} alt={m.teamA.name} className="w-full h-full object-cover" />
                                  ) : (
                                    <Shield className="w-3.5 h-3.5 text-red-400" />
                                  )}
                                </div>
                                <span className="text-xs font-bold text-white leading-tight break-words line-clamp-2">
                                  {m.teamA.name}
                                </span>
                              </div>

                              {/* VS Badge */}
                              <div className="col-span-2 text-center">
                                <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-white/10 text-[9px] font-black text-amber-400">
                                  VS
                                </span>
                              </div>

                              {/* Tim B */}
                              <div className="col-span-5 flex items-center justify-end space-x-2 text-right min-w-0">
                                <span className="text-xs font-bold text-white leading-tight break-words line-clamp-2">
                                  {m.teamB.name}
                                </span>
                                <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-slate-800/90 border border-white/10 flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
                                  {logoB ? (
                                    <img loading="lazy" src={logoB} alt={m.teamB.name} className="w-full h-full object-cover" />
                                  ) : (
                                    <Shield className="w-3.5 h-3.5 text-blue-400" />
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Info Lapangan & Status */}
                            <div className="text-[10px] text-slate-500 flex items-center justify-between pt-1 border-t border-white/5">
                              <span>{m.pitch || 'Lapangan Utama'}</span>
                              {m.status === 'LIVE' ? (
                                <span className="text-red-400 font-bold animate-pulse">● LIVE</span>
                              ) : (
                                <span className="text-slate-400 font-medium">Mendatang</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* WIDGET 3: KARTU & FAIR PLAY */}
                <div className="backdrop-blur-2xl bg-slate-900/60 border border-white/10 rounded-2xl p-5 shadow-2xl shadow-black/50 md:col-span-2 lg:col-span-1">
                  <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
                    <div className="flex items-center space-x-2">
                      <div className="w-7 h-7 rounded-lg bg-amber-950/60 border border-amber-700/50 flex items-center justify-center text-amber-400">
                        <AlertTriangle className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-black text-white tracking-wide uppercase">KARTU &amp; FAIR PLAY</h3>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold text-slate-400">Kuning / Merah</span>
                  </div>

                  {isLoading ? (
                    <div className="space-y-2 py-2 animate-pulse">
                      <div className="h-4 bg-white/5 rounded w-full" />
                      <div className="h-4 bg-white/5 rounded w-3/4" />
                    </div>
                  ) : disciplinedPlayers.length === 0 ? (
                    <div className="py-6 text-center px-4">
                      <p className="text-xs text-slate-400">Belum ada kartu pelanggaran tercatat.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {disciplinedPlayers.slice(0, 4).map(p => (
                        <div
                          key={p.id}
                          className="flex items-center justify-between p-2 rounded-xl bg-slate-950/50 border border-white/5 text-xs"
                        >
                          <div>
                            <p className="font-bold text-white truncate max-w-[130px]">{p.name}</p>
                            <p className="text-[10px] text-slate-400 truncate max-w-[130px]">{p.teamName}</p>
                          </div>
                          <div className="flex items-center space-x-1.5">
                            {(p.yellowCards || 0) > 0 && (
                              <span className="w-4 h-5 rounded-sm bg-amber-400 text-slate-950 font-black text-[10px] flex items-center justify-center shadow-sm">
                                {p.yellowCards}
                              </span>
                            )}
                            {(p.redCards || 0) > 0 && (
                              <span className="w-4 h-5 rounded-sm bg-red-600 text-white font-black text-[10px] flex items-center justify-center shadow-sm">
                                {p.redCards}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* =================================================================== */}
            {/* RIGHT COLUMN: MAIN CONTENT (TABEL KLASEMEN BESAR & DETAILED MATCH SCHEDULE) */}
            {/* =================================================================== */}
            <div className="lg:col-span-8 order-1 lg:order-2 space-y-6">
              
              {/* TOP CARD: KLASEMEN LIGA UTAMA */}
              <div className="backdrop-blur-2xl bg-slate-900/60 border border-white/10 rounded-2xl p-5 shadow-2xl shadow-black/50">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-white/10 mb-4 gap-3">
                  <div>
                    <h2 className="text-base sm:text-lg font-black text-white">
                      <span>KLASEMEN LIGA UTAMA</span>
                      <span className="block text-xs sm:text-sm font-extrabold text-red-400 mt-0.5 uppercase">
                        {cleanCategoryName(currentCatDetail.name)}
                      </span>
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Peringkat 1 &amp; 2 fase grup lolos otomatis ke Babak Knockout (Fase Gugur)
                    </p>
                  </div>

                  {/* Kontrol Kanan: Info Badge & Button Logo Info Singkatan */}
                  <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
                    <span className="px-3 py-1.5 rounded-xl bg-red-600/20 text-red-400 border border-red-500/30 text-xs font-bold">
                      Fase Grup ({catGroups.length} Grup)
                    </span>

                    {/* Button Logo Info Singkatan Klasemen */}
                    <button
                      type="button"
                      onClick={() => setShowAbbreviationModal(true)}
                      className={`px-3 py-2 rounded-xl border text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer shadow-md group ${
                        theme === 'light'
                          ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800'
                          : 'bg-slate-950/90 hover:bg-slate-800 border-white/10 text-slate-300 hover:text-white'
                      }`}
                      title="Keterangan & Singkatan Klasemen (M, W, S, K, GM, GK, SG, P)"
                    >
                      <Info className="w-3.5 h-3.5 text-blue-400 group-hover:scale-110 transition-transform" />
                      <span className="text-[11px] font-bold">Info Singkatan</span>
                    </button>
                  </div>
                </div>

                {/* Skeletons or Empty State or Standings Tables */}
                {isLoading ? (
                  <div className="space-y-4 py-4 animate-pulse">
                    <div className="h-6 bg-white/10 rounded w-48 mb-2" />
                    {[1, 2, 3, 4].map(n => (
                      <div key={n} className="h-10 bg-white/5 rounded-xl" />
                    ))}
                  </div>
                ) : catStandings.length === 0 || catStandings.every(g => g.teams.length === 0) ? (
                  <div className="py-14 text-center px-4">
                    <div className="w-16 h-16 rounded-2xl bg-slate-800/50 border border-white/10 flex items-center justify-center mx-auto mb-4 text-slate-400">
                      <Trophy className="w-8 h-8 opacity-70" />
                    </div>
                    <h3 className="text-base sm:text-lg font-black text-white">Belum Ada Data Pertandingan Untuk Kategori Ini</h3>
                    <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto mt-1">
                      Jadwal fase grup untuk Kategori {cleanCategoryName(currentCatDetail.name)} belum dibuat atau belum ada tim yang dialokasikan ke grup.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {catStandings.map(grp => (
                      <div key={grp.groupName} className="space-y-2">
                        <div className="flex items-center justify-between px-1">
                          <h4 className="text-xs font-black text-red-400 tracking-wider uppercase">
                            {grp.groupName}
                          </h4>
                          <span className="text-[10px] text-slate-400 font-bold">{grp.teams.length} Tim</span>
                        </div>

                        {/* Standings Table with horizontal scroll for responsiveness (ANTI-WRAPPING) */}
                        <div className={`w-full overflow-x-auto rounded-xl border ${theme === 'light' ? 'border-slate-200 bg-white/95 shadow-sm' : 'border-white/10 bg-slate-950/60 shadow-inner'} scrollbar-thin`}>
                          <table className="w-full text-left text-xs whitespace-nowrap">
                            <thead>
                              <tr className={`border-b ${theme === 'light' ? 'border-slate-200 bg-slate-100/95 text-slate-600' : 'border-white/10 bg-slate-900/90 text-slate-400'} text-[10px] font-black uppercase tracking-wider whitespace-nowrap`}>
                                <th className={`py-2.5 px-3 text-center w-10 sticky left-0 z-10 ${theme === 'light' ? 'bg-slate-100' : 'bg-slate-900/95 backdrop-blur-md'}`}>POS</th>
                                <th className={`py-2.5 px-3 min-w-[210px] sm:min-w-[250px] sticky left-10 z-10 ${theme === 'light' ? 'bg-slate-100' : 'bg-slate-900/95 backdrop-blur-md'}`}>TIM</th>
                                <th className="py-2.5 px-2.5 text-center" title="Matches Played (Main)">M</th>
                                <th className="py-2.5 px-2.5 text-center text-emerald-500 dark:text-emerald-400 font-bold" title="Menang (Win)">W</th>
                                <th className={`py-2.5 px-2.5 text-center ${theme === 'light' ? 'text-slate-600' : 'text-slate-300'}`} title="Seri (Draw)">S</th>
                                <th className="py-2.5 px-2.5 text-center text-red-500 dark:text-red-400 font-bold" title="Kalah (Lost)">K</th>
                                <th className={`py-2.5 px-2.5 text-center ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`} title="Gol Masuk (GF)">GM</th>
                                <th className={`py-2.5 px-2.5 text-center ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`} title="Gol Kemasukan (GA)">GK</th>
                                <th className={`py-2.5 px-2.5 text-center font-bold ${theme === 'light' ? 'text-slate-700' : 'text-slate-300'}`} title="Selisih Gol (GD)">SG</th>
                                <th className={`py-2.5 px-3.5 text-center font-black ${theme === 'light' ? 'text-red-600 bg-red-100/50' : 'text-red-400 bg-red-950/40'}`} title="Poin Total">P</th>
                                <th className="py-2.5 px-3 text-center">FORM</th>
                              </tr>
                            </thead>
                            <tbody className={`divide-y ${theme === 'light' ? 'divide-slate-100' : 'divide-white/5'}`}>
                              {grp.teams.map((t, idx) => {
                                const forms = getTeamForm(t.teamName);
                                const logo = getTeamLogo(t.teamName, t.teamLogo);

                                return (
                                  <tr
                                    key={t.teamName}
                                    className={`transition-all duration-200 whitespace-nowrap ${
                                      theme === 'light' ? 'hover:bg-red-50/60 hover:shadow-xs' : 'hover:bg-red-950/25 hover:shadow-xs'
                                    } ${
                                      idx === 0
                                        ? theme === 'light'
                                          ? 'bg-amber-50/50'
                                          : 'bg-gradient-to-r from-amber-950/20 via-transparent to-transparent'
                                        : ''
                                    }`}
                                  >
                                    <td className={`py-2.5 px-3 text-center font-bold sticky left-0 z-10 ${
                                      theme === 'light' ? 'bg-white/95 border-r border-slate-100' : 'bg-slate-950/95 backdrop-blur-md border-r border-white/5'
                                    }`}>
                                      <span
                                        className={`inline-flex items-center justify-center w-5 h-5 rounded-md text-[10px] font-black ${
                                          idx === 0
                                            ? 'bg-amber-500 text-slate-950'
                                            : idx === 1
                                            ? 'bg-blue-600 text-white'
                                            : theme === 'light' ? 'text-slate-600 bg-slate-100' : 'text-slate-400'
                                        }`}
                                      >
                                        {idx + 1}
                                      </span>
                                    </td>
                                    <td className={`py-2.5 px-3 font-bold sticky left-10 z-10 min-w-[210px] sm:min-w-[250px] ${
                                      theme === 'light' ? 'bg-white/95 text-slate-900 border-r border-slate-100' : 'bg-slate-950/95 text-white backdrop-blur-md border-r border-white/5'
                                    }`}>
                                      {(() => {
                                        const liveMatch = getTeamLiveMatch(t.teamName);
                                        const oppName = liveMatch ? (liveMatch.teamA?.name?.trim().toLowerCase() === t.teamName.trim().toLowerCase() ? liveMatch.teamB.name : liveMatch.teamA.name) : '';

                                        return (
                                          <div className="flex items-center justify-between gap-3 w-full">
                                            {/* Sisi Kiri: Logo & Nama Tim */}
                                            <div className="flex items-center space-x-2.5 min-w-0 pr-1.5">
                                              <div className={`w-6 h-6 sm:w-7 sm:h-7 rounded-lg flex items-center justify-center overflow-hidden shrink-0 border shadow-sm ${
                                                theme === 'light' ? 'bg-slate-100 border-slate-200' : 'bg-slate-800 border-white/10'
                                              }`}>
                                                {logo ? (
                                                  <img loading="lazy" src={logo} alt={t.teamName} className="w-full h-full object-cover" />
                                                ) : (
                                                  <Shield className="w-3.5 h-3.5 text-slate-400" />
                                                )}
                                              </div>
                                              {/* NAMA TIM TEGAS TANPA SUBTITEL */}
                                              <span className={`font-bold block text-xs sm:text-sm whitespace-nowrap leading-tight truncate ${
                                                theme === 'light' ? 'text-slate-900' : 'text-white'
                                              }`}>
                                                {t.teamName}
                                              </span>
                                            </div>

                                            {/* INDIKATOR LIVE RATA KANAN: HANYA 🔴 LIVE SAJA (TANPA SKOR & MENIT) */}
                                            {liveMatch && (
                                              <div className="ml-auto shrink-0 pl-1">
                                                <span
                                                  className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-black uppercase tracking-wider shadow-sm shadow-red-600/50 animate-pulse cursor-default"
                                                  title={`Sedang Bertanding LIVE vs ${oppName || 'Lawan'}`}
                                                >
                                                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                                                  <span>LIVE</span>
                                                </span>
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })()}
                                    </td>
                                    <td className={`py-2.5 px-2.5 text-center font-medium ${theme === 'light' ? 'text-slate-700' : 'text-slate-300'}`}>{t.played}</td>
                                    <td className="py-2.5 px-2.5 text-center text-emerald-500 dark:text-emerald-400 font-bold">{t.won}</td>
                                    <td className={`py-2.5 px-2.5 text-center ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>{t.drawn}</td>
                                    <td className="py-2.5 px-2.5 text-center text-red-500 dark:text-red-400 font-bold">{t.lost}</td>
                                    <td className={`py-2.5 px-2.5 text-center ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>{t.goalsFor}</td>
                                    <td className={`py-2.5 px-2.5 text-center ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>{t.goalsAgainst}</td>
                                    <td className={`py-2.5 px-2.5 text-center font-bold ${theme === 'light' ? 'text-slate-800' : 'text-slate-300'}`}>
                                      {t.goalDifference > 0 ? `+${t.goalDifference}` : t.goalDifference}
                                    </td>
                                    <td className={`py-2.5 px-3.5 text-center font-black text-sm ${
                                      theme === 'light' ? 'text-red-600 bg-red-50' : 'text-red-400 bg-red-950/30'
                                    }`}>
                                      {t.points}
                                    </td>
                                    <td className="py-2.5 px-3 text-center">
                                      {forms.length === 0 ? (
                                        <span className="text-[10px] text-slate-400">-</span>
                                      ) : (
                                        <div className="flex items-center justify-center space-x-1">
                                          {forms.map((f, fIdx) => (
                                            <span
                                              key={fIdx}
                                              className={`w-3.5 h-3.5 rounded-full text-[8px] font-black flex items-center justify-center ${
                                                f === 'W'
                                                  ? 'bg-emerald-500 text-slate-950'
                                                  : f === 'D'
                                                  ? 'bg-slate-500 text-white'
                                                  : 'bg-red-500 text-white'
                                              }`}
                                            >
                                              {f}
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* BOTTOM CARD: DETAILED MATCH SCHEDULE & RECENT RESULTS */}
              <div className="backdrop-blur-2xl bg-slate-900/60 border border-white/10 rounded-2xl p-5 shadow-2xl shadow-black/50">
                <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
                  <div>
                    <h3 className="text-sm sm:text-base font-black text-white flex items-center gap-1.5 uppercase">
                      <Zap className="w-4 h-4 text-red-500" />
                      DETAILED MATCH SCHEDULE &amp; RECENT RESULTS
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">Hasil pertandingan terkini dan jadwal putaran grup</p>
                  </div>
                  <button
                    onClick={() => setActiveTab('JADWAL')}
                    className="text-xs font-bold text-red-400 hover:text-red-300 transition cursor-pointer"
                  >
                    Lihat Semua Jadwal &gt;
                  </button>
                </div>

                {isLoading ? (
                  <div className="space-y-3 py-2 animate-pulse">
                    {[1, 2].map(n => (
                      <div key={n} className="h-16 bg-white/5 rounded-xl" />
                    ))}
                  </div>
                ) : detailedScheduleMatches.length === 0 ? (
                  <div className="py-10 text-center px-4">
                    <p className="text-xs text-slate-400">Belum ada jadwal pertandingan yang dibuat untuk kategori ini.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {detailedScheduleMatches.map(m => {
                      const logoA = getTeamLogo(m.teamA.name, m.teamA.logo);
                      const logoB = getTeamLogo(m.teamB.name, m.teamB.logo);

                      return (
                        <div
                          key={m.id}
                          className="p-3.5 rounded-xl bg-slate-950/65 border border-white/10 hover:border-red-500/40 transition flex flex-col justify-between space-y-3 shadow-md"
                        >
                          {/* Header Laga: Babak & Tanggal / Jam */}
                          <div className="flex flex-wrap items-center justify-between text-[10px] text-slate-400 gap-1.5 pb-2 border-b border-white/5">
                            <span className="font-bold text-slate-300 px-1.5 py-0.5 rounded bg-slate-800/80 border border-white/10">
                              {m.round}{m.group ? ` • ${m.group}` : ''}
                            </span>
                            <div className="flex items-center space-x-1.5 text-amber-400 font-bold">
                              <Calendar className="w-3 h-3 text-amber-500/90" />
                              <span>{m.date || 'TBA'}</span>
                              <span className="text-slate-600">•</span>
                              <Clock className="w-3 h-3 text-amber-500/90" />
                              <span>{m.time ? `${m.time} WIB` : 'TBA'}</span>
                            </div>
                          </div>

                          {/* MODE MOBILE (HP): Logo di atas, Nama Tim Bold di bawah logo, Skor Horisontal Simetris */}
                          <div className="flex sm:hidden items-center justify-between gap-2 py-1">
                            {/* Tim A (Kiri): Logo di atas, Nama tim bold di bawah */}
                            <div className="flex-1 flex flex-col items-center text-center min-w-0">
                              <div className="w-10 h-10 rounded-lg bg-slate-800/90 border border-white/10 flex items-center justify-center overflow-hidden shrink-0 shadow-sm p-1 mb-1">
                                {logoA ? (
                                  <img loading="lazy" src={logoA} alt={m.teamA.name} className="w-full h-full object-contain" />
                                ) : (
                                  <Shield className="w-4 h-4 text-red-400" />
                                )}
                              </div>
                              <span className="font-extrabold text-[11px] text-white leading-tight break-words text-center line-clamp-2 px-0.5">
                                {m.teamA.name}
                              </span>
                            </div>

                            {/* Skor Horisontal Simetris / VS (Tengah) */}
                            <div className="shrink-0 flex flex-col items-center justify-center px-1">
                              {m.status === 'FINISHED' || m.status === 'LIVE' ? (
                                <div className="flex flex-col items-center">
                                  <span className="inline-block px-2.5 py-1 rounded-xl bg-slate-900/95 text-red-400 font-black border border-white/15 text-xs sm:text-sm shadow-inner font-mono">
                                    {m.teamA.score ?? 0} - {m.teamB.score ?? 0}
                                  </span>
                                  {m.status === 'LIVE' && (
                                    <span className="text-[9px] text-red-400 font-bold animate-pulse mt-0.5">
                                      LIVE {m.liveMinute ? `${m.liveMinute}'` : ''}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <div className="flex flex-col items-center">
                                  <span className="inline-block px-2 py-0.5 rounded bg-slate-900 border border-white/10 text-[9px] font-black text-amber-400">
                                    VS
                                  </span>
                                  <span className="text-[9px] text-slate-400 font-mono mt-0.5">
                                    {m.time ? `${m.time} WIB` : 'TBA'}
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Tim B (Kanan): Logo di atas, Nama tim bold di bawah */}
                            <div className="flex-1 flex flex-col items-center text-center min-w-0">
                              <div className="w-10 h-10 rounded-lg bg-slate-800/90 border border-white/10 flex items-center justify-center overflow-hidden shrink-0 shadow-sm p-1 mb-1">
                                {logoB ? (
                                  <img loading="lazy" src={logoB} alt={m.teamB.name} className="w-full h-full object-contain" />
                                ) : (
                                  <Shield className="w-4 h-4 text-blue-400" />
                                )}
                              </div>
                              <span className="font-extrabold text-[11px] text-white leading-tight break-words text-center line-clamp-2 px-0.5">
                                {m.teamB.name}
                              </span>
                            </div>
                          </div>

                          {/* MODE DESKTOP/TABLET (sm:grid) */}
                          <div className="hidden sm:grid grid-cols-12 gap-2 items-center py-1">
                            {/* Tim A */}
                            <div className="col-span-5 flex items-center space-x-2 min-w-0">
                              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-slate-800/90 border border-white/10 flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
                                {logoA ? (
                                  <img loading="lazy" src={logoA} alt={m.teamA.name} className="w-full h-full object-cover" />
                                ) : (
                                  <Shield className="w-4 h-4 text-red-400" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <span className="text-xs sm:text-sm font-bold text-white block leading-tight break-words line-clamp-2">
                                  {m.teamA.name}
                                </span>
                              </div>
                            </div>

                            {/* Skor / VS */}
                            <div className="col-span-2 text-center">
                              {m.status === 'FINISHED' || m.status === 'LIVE' ? (
                                <span className="inline-block px-2.5 py-1 rounded-xl bg-slate-900/95 text-red-400 font-black border border-white/15 text-xs sm:text-sm shadow-inner">
                                  {m.teamA.score ?? 0} : {m.teamB.score ?? 0}
                                </span>
                              ) : (
                                <span className="inline-block px-2 py-0.5 rounded bg-slate-900 border border-white/10 text-[9px] font-black text-amber-400">
                                  VS
                                </span>
                              )}
                            </div>

                            {/* Tim B */}
                            <div className="col-span-5 flex items-center justify-end space-x-2 text-right min-w-0">
                              <div className="min-w-0 text-right">
                                <span className="text-xs sm:text-sm font-bold text-white block leading-tight break-words line-clamp-2">
                                  {m.teamB.name}
                                </span>
                              </div>
                              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-slate-800/90 border border-white/10 flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
                                {logoB ? (
                                  <img loading="lazy" src={logoB} alt={m.teamB.name} className="w-full h-full object-cover" />
                                ) : (
                                  <Shield className="w-4 h-4 text-blue-400" />
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Footer: Lapangan & Status */}
                          <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[10px] text-slate-500">
                            <span>{m.pitch || 'Lapangan Utama'}</span>
                            {m.status === 'LIVE' ? (
                              <span className="text-red-400 font-bold animate-pulse">🔴 LIVE</span>
                            ) : m.status === 'FINISHED' ? (
                              <span className="text-emerald-400 font-semibold">SELESAI</span>
                            ) : (
                              <span className="text-slate-400">MENDATANG</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ======================================================================= */}
        {/* TAB 3: TOP SKOR & KARTU                                                 */}
        {/* ======================================================================= */}
        {activeTab === 'TOPSKOR' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            
            {/* LEFT CARD: DAFTAR TOP SCORER */}
            <div className="backdrop-blur-2xl bg-slate-900/60 border border-white/10 rounded-2xl p-5 shadow-2xl shadow-black/50">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3.5 border-b border-white/10 mb-4 gap-2.5 sm:gap-4">
                <div className="flex items-center space-x-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-red-950/60 border border-red-700/50 flex items-center justify-center text-red-500 shrink-0">
                    <Flame className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm sm:text-base font-black text-white uppercase tracking-wide">
                      <span>DAFTAR TOP SCORER</span>
                      <span className="block text-xs sm:text-sm font-extrabold text-red-400 mt-0.5">
                        {cleanCategoryName(currentCatDetail.name)}
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">Pencetak gol terbanyak turnamen</p>
                  </div>
                </div>
                <div className="flex items-center self-start sm:self-auto shrink-0">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950/70 border border-white/10 text-xs font-bold text-slate-300 shadow-sm">
                    <Users className="w-3.5 h-3.5 text-red-400" />
                    <span><strong className="text-white font-extrabold">{topScorers.length}</strong> Pemain</span>
                  </span>
                </div>
              </div>

              {isLoading ? (
                <div className="space-y-3 py-4 animate-pulse">
                  {[1, 2, 3, 4].map(n => (
                    <div key={n} className="h-12 bg-white/5 rounded-xl" />
                  ))}
                </div>
              ) : topScorers.length === 0 ? (
                <div className="py-14 text-center px-4">
                  <p className="text-xs sm:text-sm text-slate-400">Belum ada gol tercatat untuk kategori ini.</p>
                </div>
              ) : (
                <div className="divide-y divide-white/5">
                  {topScorers.map((p, idx) => (
                    <div key={p.id} className="py-3 flex items-center justify-between text-xs">
                      <div className="flex items-center space-x-3">
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black ${
                            idx === 0
                              ? 'bg-amber-500 text-slate-950'
                              : idx === 1
                              ? 'bg-slate-300 text-slate-950'
                              : idx === 2
                              ? 'bg-amber-700 text-white'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {idx + 1}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-white">{p.name}</p>
                          <p className="text-xs text-slate-400">{p.teamName} {p.jerseyNumber ? `• #${p.jerseyNumber}` : ''}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-1.5 px-3 py-1 rounded-lg bg-red-950/40 border border-red-800/40 text-red-400 font-black text-sm">
                        <span>{p.goals || 0}</span>
                        <span className="text-[10px] font-normal text-slate-400">GOL</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* RIGHT CARD: REKAP KARTU */}
            <div className="backdrop-blur-2xl bg-slate-900/60 border border-white/10 rounded-2xl p-5 shadow-2xl shadow-black/50">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3.5 border-b border-white/10 mb-4 gap-2.5 sm:gap-4">
                <div className="flex items-center space-x-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-amber-950/60 border border-amber-700/50 flex items-center justify-center text-amber-400 shrink-0">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm sm:text-base font-black text-white uppercase tracking-wide">
                      <span>REKAP KARTU</span>
                      <span className="block text-xs sm:text-sm font-extrabold text-amber-400 mt-0.5">
                        {cleanCategoryName(currentCatDetail.name)}
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">Disiplin &amp; Fair Play</p>
                  </div>
                </div>
                <div className="flex items-center self-start sm:self-auto shrink-0">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950/70 border border-white/10 text-xs font-bold text-slate-300 shadow-sm">
                    <Users className="w-3.5 h-3.5 text-amber-400" />
                    <span><strong className="text-white font-extrabold">{disciplinedPlayers.length}</strong> Pemain</span>
                  </span>
                </div>
              </div>

              {isLoading ? (
                <div className="space-y-3 py-4 animate-pulse">
                  {[1, 2, 3].map(n => (
                    <div key={n} className="h-12 bg-white/5 rounded-xl" />
                  ))}
                </div>
              ) : disciplinedPlayers.length === 0 ? (
                <div className="py-14 text-center px-4">
                  <p className="text-xs sm:text-sm text-slate-400">Belum ada kartu pelanggaran tercatat.</p>
                </div>
              ) : (
                <div className="divide-y divide-white/5">
                  {disciplinedPlayers.map(p => (
                    <div key={p.id} className="py-3 flex items-center justify-between text-xs">
                      <div>
                        <p className="text-sm font-bold text-white">{p.name}</p>
                        <p className="text-xs text-slate-400">{p.teamName}</p>
                      </div>
                      <div className="flex items-center space-x-2">
                        {(p.yellowCards || 0) > 0 && (
                          <div className="flex items-center space-x-1 px-2 py-0.5 rounded bg-amber-950/60 border border-amber-500/40 text-amber-400 font-bold text-xs">
                            <span className="w-3 h-4 rounded-sm bg-amber-400" />
                            <span>{p.yellowCards}</span>
                          </div>
                        )}
                        {(p.redCards || 0) > 0 && (
                          <div className="flex items-center space-x-1 px-2 py-0.5 rounded bg-red-950/60 border border-red-500/40 text-red-400 font-bold text-xs">
                            <span className="w-3 h-4 rounded-sm bg-red-600" />
                            <span>{p.redCards}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ======================================================================= */}
        {/* TAB 4: BAGAN KNOCKOUT                                                   */}
        {/* ======================================================================= */}
        {activeTab === 'KNOCKOUT' && (
          <div className="space-y-6">
            <div className="backdrop-blur-2xl bg-slate-900/60 border border-white/10 rounded-2xl p-5 shadow-2xl shadow-black/50">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-white/10 mb-6 gap-2">
                <div>
                  <h2 className="text-base sm:text-lg font-black text-white flex items-start gap-2.5">
                    <Layers className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                    <div>
                      <span>BAGAN KNOCKOUT (FASE GUGUR)</span>
                      <span className="block text-xs sm:text-sm font-extrabold text-red-400 mt-0.5 uppercase">
                        {cleanCategoryName(currentCatDetail.name)}
                      </span>
                    </div>
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Format otomatis hasil dari Juara Grup &amp; Runner-up Grup ({categoryRegistrationCounts[selectedCat] || 0} Tim Terdaftar)
                  </p>
                </div>
                <span className="px-3 py-1 rounded-full bg-amber-950/40 border border-amber-800/40 text-xs font-bold text-amber-300 flex items-center gap-1.5 self-start sm:self-auto">
                  <Trophy className="w-3.5 h-3.5 text-amber-400" />
                  Sistem Gugur Tunggal
                </span>
              </div>

              {/* Waiting State or Interactive Bracket */}
              {isLoading ? (
                <div className="py-16 animate-pulse text-center">
                  <div className="w-16 h-16 rounded-full bg-white/10 mx-auto mb-4" />
                  <div className="h-4 bg-white/10 rounded w-64 mx-auto mb-2" />
                  <div className="h-3 bg-white/5 rounded w-96 mx-auto" />
                </div>
              ) : knockoutMatches.length === 0 ? (
                <div className="py-10 text-center px-4 max-w-4xl mx-auto">
                  <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-4 text-amber-400">
                    <Trophy className="w-8 h-8 opacity-80" />
                  </div>
                  <h3 className="text-lg sm:text-xl font-black text-white">
                    Bagan Knockout Menunggu Selesainya Fase Grup
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-400 max-w-xl mx-auto mt-2 leading-relaxed">
                    Bagan fase gugur (Perempat Final, Semifinal, dan Grand Final) otomatis terisi berdasarkan posisi Juara Grup dan Runner-up Grup dari klasemen setelah pertandingan fase grup selesai.
                  </p>

                  <div className="my-8 border-t border-white/10" />

                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">
                    SKEMA JALUR JUARA GRUP MENUJU FINAL:
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
                    <div className="p-4 rounded-xl bg-slate-950/70 border border-white/10">
                      <span className="text-[10px] font-black text-red-400 uppercase tracking-wider block mb-2">
                        PEREMPAT FINAL (8 BESAR)
                      </span>
                      <p className="text-xs font-bold text-white mb-1">Juara Grup A vs Runner-up Grup B</p>
                      <p className="text-xs font-bold text-white">Juara Grup C vs Runner-up Grup D</p>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-950/70 border border-white/10">
                      <span className="text-[10px] font-black text-amber-400 uppercase tracking-wider block mb-2">
                        BABAK SEMIFINAL
                      </span>
                      <p className="text-xs font-bold text-white mb-1">Pemenang QF 1 vs Pemenang QF 2</p>
                      <p className="text-xs font-bold text-white">Pemenang QF 3 vs Pemenang QF 4</p>
                    </div>

                    <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-500/40">
                      <span className="text-[10px] font-black text-amber-300 uppercase tracking-wider flex items-center gap-1 mb-2">
                        <Trophy className="w-3.5 h-3.5 text-amber-400" />
                        GRAND FINAL &amp; JUARA 3
                      </span>
                      <p className="text-xs font-bold text-white mb-1">Perebutan Juara 1 &amp; Piala Bergilir</p>
                      <p className="text-xs font-bold text-white">Perebutan Juara 3</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-5">
                  {/* Pill Navigasi Ronde (Ramah HP / Tablet / Desktop) */}
                  <div className="flex items-center gap-2 overflow-x-auto pb-2 pt-1 scrollbar-thin scrollbar-thumb-white/10">
                    <button
                      type="button"
                      onClick={() => setSelectedKnockoutStage('ALL')}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
                        selectedKnockoutStage === 'ALL'
                          ? 'bg-red-600 text-white shadow-md shadow-red-600/40'
                          : theme === 'light'
                          ? 'bg-slate-100 border border-slate-200 text-slate-700 hover:bg-slate-200'
                          : 'bg-slate-950/70 border border-white/10 text-slate-300 hover:text-white hover:bg-slate-800'
                      }`}
                    >
                      <Layers className="w-3.5 h-3.5" />
                      <span>Semua Bagan</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-black/40 text-slate-200 font-bold">
                        {knockoutMatches.length}
                      </span>
                    </button>

                    {knockoutStages.map(stage => {
                      const isStageActive = selectedKnockoutStage === stage.id;
                      return (
                        <button
                          key={stage.id}
                          type="button"
                          onClick={() => setSelectedKnockoutStage(stage.id)}
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
                            isStageActive
                              ? 'bg-red-600 text-white shadow-md shadow-red-600/40'
                              : theme === 'light'
                              ? 'bg-slate-100 border border-slate-200 text-slate-700 hover:bg-slate-200'
                              : 'bg-slate-950/70 border border-white/10 text-slate-300 hover:text-white hover:bg-slate-800'
                          }`}
                        >
                          <span>{stage.icon}</span>
                          <span>{stage.shortTitle}</span>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                              isStageActive ? 'bg-black/40 text-white' : 'bg-black/30 text-slate-400'
                            }`}
                          >
                            {stage.matches.length}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* TAMPILAN 1: SEMUA BAGAN (Bagan Pohon Turnamen Berkolom Horizontal) */}
                  {selectedKnockoutStage === 'ALL' ? (
                    <div>
                      {/* Petunjuk Mobile */}
                      <div className="flex md:hidden items-center justify-between text-[11px] text-slate-400 mb-2 px-1">
                        <span>💡 Geser ke kanan untuk melihat bagan berikutnya</span>
                        <span className="text-red-400 font-bold flex items-center gap-0.5">
                          Geser <ArrowRight className="w-3 h-3 inline" />
                        </span>
                      </div>

                      <div className="flex gap-4 sm:gap-6 overflow-x-auto pb-6 pt-1 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent snap-x">
                        {knockoutStages.map((stage, sIdx) => (
                          <div
                            key={stage.id}
                            className="w-[285px] sm:w-[320px] shrink-0 snap-start flex flex-col space-y-3.5"
                          >
                            {/* Header Kolom Ronde */}
                            <div
                              className={`p-3 rounded-2xl border ${stage.badgeBorder} ${stage.badgeBg} flex items-center justify-between shadow-sm`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-base shrink-0">{stage.icon}</span>
                                <div className="min-w-0">
                                  <h3 className={`text-xs font-black uppercase tracking-wider truncate ${stage.badgeText}`}>
                                    {stage.title}
                                  </h3>
                                  <span className={`text-[10px] ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>
                                    Tahap {sIdx + 1} dari {knockoutStages.length}
                                  </span>
                                </div>
                              </div>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-black/40 text-slate-300 shrink-0">
                                {stage.matches.length} Laga
                              </span>
                            </div>

                            {/* Daftar Kartu Pertandingan Kolom */}
                            <div className="space-y-3">
                              {stage.matches.map(m => renderKnockoutMatchCard(m))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : activeSelectedStage ? (
                    /* TAMPILAN 2: FOKUS BABAK TERTENTU (Grid Vertikal Responsif - Ramah Mobile) */
                    <div className="space-y-4">
                      <div
                        className={`p-4 rounded-2xl border ${activeSelectedStage.badgeBorder} ${activeSelectedStage.badgeBg} flex flex-col sm:flex-row sm:items-center justify-between gap-3`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{activeSelectedStage.icon}</span>
                          <div>
                            <h3 className={`text-sm sm:text-base font-black uppercase tracking-wide ${activeSelectedStage.badgeText}`}>
                              {activeSelectedStage.title}
                            </h3>
                            <p className={`text-xs ${theme === 'light' ? 'text-slate-600' : 'text-slate-400'}`}>
                              Daftar pertandingan babak {activeSelectedStage.shortTitle} Kategori {cleanCategoryName(currentCatDetail.name)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2.5 self-start sm:self-auto">
                          <span className="text-xs font-bold px-3 py-1 rounded-full bg-black/40 text-slate-200">
                            {activeSelectedStage.matches.length} Pertandingan
                          </span>
                          <button
                            type="button"
                            onClick={() => setSelectedKnockoutStage('ALL')}
                            className="text-xs text-red-400 hover:text-red-300 font-bold underline cursor-pointer"
                          >
                            Lihat Semua Bagan
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                        {activeSelectedStage.matches.map(m => renderKnockoutMatchCard(m))}
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ========================================================================= */}
      {/* MODAL PANDUAN SINGKATAN KLASEMEN (M, W, S, K, GM, GK, SG, P)            */}
      {/* ========================================================================= */}
      {showAbbreviationModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md animate-fadeIn"
          onClick={() => setShowAbbreviationModal(false)}
        >
          <div
            className="w-full max-w-2xl bg-slate-900 border border-white/15 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            onClick={e => e.stopPropagation()}
          >
            {/* Header Modal */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-slate-950/80">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-blue-950/80 border border-blue-600/50 flex items-center justify-center text-blue-400">
                  <Info className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-white">
                    Panduan Singkatan &amp; Aturan Klasemen
                  </h3>
                  <p className="text-xs text-slate-400">
                    Standar resmi perhitungan klasemen {config.name || 'Wabup Cup'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAbbreviationModal(false)}
                className="w-8 h-8 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer"
                title="Tutup"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Isi Konten Modal (Scrollable) */}
            <div className="p-6 space-y-5 overflow-y-auto custom-scrollbar text-xs">
              {/* Grid Singkatan */}
              <div>
                <h4 className="text-xs font-black text-amber-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  Arti Singkatan Kolom Tabel
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="p-2.5 rounded-xl bg-slate-950/70 border border-white/5 flex items-start space-x-2.5">
                    <span className="w-9 h-8 rounded-lg bg-slate-800 font-mono font-black text-white flex items-center justify-center text-xs shrink-0">
                      POS
                    </span>
                    <div>
                      <p className="font-bold text-white text-xs">Posisi / Peringkat</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">Urutan ranking tim saat ini di grup/klasemen liga.</p>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-950/70 border border-white/5 flex items-start space-x-2.5">
                    <span className="w-9 h-8 rounded-lg bg-slate-800 font-mono font-black text-white flex items-center justify-center text-xs shrink-0">
                      TIM
                    </span>
                    <div>
                      <p className="font-bold text-white text-xs">Nama Tim &amp; Instansi</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">Nama tim peserta dan asal sekolah/instansi terdaftar.</p>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-950/70 border border-white/5 flex items-start space-x-2.5">
                    <span className="w-9 h-8 rounded-lg bg-slate-800 font-mono font-black text-blue-400 flex items-center justify-center text-xs shrink-0">
                      M
                    </span>
                    <div>
                      <p className="font-bold text-white text-xs">Main (Matches Played)</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">Jumlah seluruh pertandingan yang telah diselesaikan.</p>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-950/70 border border-white/5 flex items-start space-x-2.5">
                    <span className="w-9 h-8 rounded-lg bg-emerald-950/80 border border-emerald-700/50 font-mono font-black text-emerald-400 flex items-center justify-center text-xs shrink-0">
                      W
                    </span>
                    <div>
                      <p className="font-bold text-emerald-400 text-xs">Win (Menang)</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">Setiap kemenangan memberikan <span className="text-emerald-300 font-bold">+3 Poin</span>.</p>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-950/70 border border-white/5 flex items-start space-x-2.5">
                    <span className="w-9 h-8 rounded-lg bg-slate-800 font-mono font-black text-slate-300 flex items-center justify-center text-xs shrink-0">
                      S
                    </span>
                    <div>
                      <p className="font-bold text-slate-300 text-xs">Seri (Draw)</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">Pertandingan berakhir imbang memberikan <span className="text-slate-200 font-bold">+1 Poin</span>.</p>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-950/70 border border-white/5 flex items-start space-x-2.5">
                    <span className="w-9 h-8 rounded-lg bg-red-950/80 border border-red-700/50 font-mono font-black text-red-400 flex items-center justify-center text-xs shrink-0">
                      K
                    </span>
                    <div>
                      <p className="font-bold text-red-400 text-xs">Kalah (Lost)</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">Pertandingan berakhir dengan kekalahan (<span className="text-red-300 font-bold">0 Poin</span>).</p>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-950/70 border border-white/5 flex items-start space-x-2.5">
                    <span className="w-9 h-8 rounded-lg bg-slate-800 font-mono font-black text-white flex items-center justify-center text-xs shrink-0">
                      GM
                    </span>
                    <div>
                      <p className="font-bold text-white text-xs">Gol Masuk (Goals For)</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">Akumulasi total gol yang dicetak tim ke gawang lawan.</p>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-950/70 border border-white/5 flex items-start space-x-2.5">
                    <span className="w-9 h-8 rounded-lg bg-slate-800 font-mono font-black text-white flex items-center justify-center text-xs shrink-0">
                      GK
                    </span>
                    <div>
                      <p className="font-bold text-white text-xs">Gol Kemasukan (Goals Against)</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">Total gol yang bersarang ke gawang tim dari lawan.</p>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-950/70 border border-white/5 flex items-start space-x-2.5">
                    <span className="w-9 h-8 rounded-lg bg-slate-800 font-mono font-black text-amber-400 flex items-center justify-center text-xs shrink-0">
                      SG
                    </span>
                    <div>
                      <p className="font-bold text-amber-400 text-xs">Selisih Gol (Goal Difference)</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">Kalkulasi <span className="font-mono text-white">GM - GK</span>. Kriteria pertama jika poin imbang.</p>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-red-950/40 border border-red-700/50 flex items-start space-x-2.5">
                    <span className="w-9 h-8 rounded-lg bg-red-600 font-mono font-black text-white flex items-center justify-center text-xs shrink-0 shadow-sm">
                      P
                    </span>
                    <div>
                      <p className="font-bold text-red-400 text-xs">Poin Total</p>
                      <p className="text-[11px] text-slate-300 mt-0.5">Total perolehan poin: <span className="font-mono font-bold">(W × 3) + (S × 1)</span>.</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Aturan Kelolosan & Tie-Breaker */}
              <div className="p-3.5 rounded-xl bg-slate-950/90 border border-white/10 space-y-2">
                <h4 className="text-xs font-black text-white flex items-center gap-1.5">
                  <Trophy className="w-4 h-4 text-amber-400" />
                  Sistem Penentuan Peringkat &amp; Kelolosan
                </h4>
                <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-300">
                  <li>
                    <span className="font-bold text-white">Peringkat 1 (Juara Grup) &amp; Peringkat 2 (Runner-up)</span> berhak lolos otomatis ke Babak Gugur / Knockout.
                  </li>
                  <li>
                    Apabila dua atau lebih tim memiliki <span className="font-bold text-white">Poin (P) yang sama</span>, urutan klasemen ditentukan berdasarkan kriteria berurutan:
                    <ol className="list-decimal list-inside ml-3 mt-1 space-y-0.5 text-slate-400">
                      <li>Selisih Gol (SG) terbesar</li>
                      <li>Jumlah Gol Masuk (GM) terbanyak</li>
                      <li>Hasil pertandingan langsung (Head-to-Head)</li>
                      <li>Kedisiplinan &amp; Fair Play (kartu kuning/merah paling sedikit)</li>
                    </ol>
                  </li>
                </ul>
              </div>
            </div>

            {/* Footer Modal */}
            <div className="px-6 py-3.5 border-t border-white/10 bg-slate-950/90 flex justify-end">
              <button
                type="button"
                onClick={() => setShowAbbreviationModal(false)}
                className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs transition cursor-pointer shadow-lg shadow-red-900/30"
              >
                Saya Mengerti
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. FOOTER                                                                 */}
      {/* ========================================================================= */}
      <footer className="relative z-10 w-full border-t border-white/10 bg-slate-950/80 backdrop-blur-xl py-8 mt-12 text-center">
        <div className="w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-xs font-bold text-slate-300 uppercase tracking-wider">
            {config.name || 'WabupCup'} • SISTEM KLASEMEN RESMI TERPADU
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-slate-400 mt-2">
            <button onClick={onBackToHome} className="hover:text-white transition cursor-pointer">Halaman Utama</button>
            <span>•</span>
            <button onClick={() => setActiveTab('KLASEMEN')} className="hover:text-white transition cursor-pointer">Klasemen</button>
            <span>•</span>
            <button onClick={() => setActiveTab('JADWAL')} className="hover:text-white transition cursor-pointer">Jadwal</button>
            <span>•</span>
            <button onClick={() => setActiveTab('TOPSKOR')} className="hover:text-white transition cursor-pointer">Top Skor</button>
            <span>•</span>
            <button onClick={() => setActiveTab('KNOCKOUT')} className="hover:text-white transition cursor-pointer">Bagan Knockout</button>
          </div>
          <p className="text-[11px] text-slate-500 mt-3">
            Platform Turnamen Resmi. Hak Cipta &copy; {config.edition ? config.edition.slice(0, 4) : '2026'} Panitia Pelaksana {config.name || 'Wabup Cup'}.
          </p>
        </div>
      </footer>
    </div>
  );
};
