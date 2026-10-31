import React, { useState } from 'react';
import { motion } from 'motion/react';
import { useTournament } from '../context/TournamentContext';
import { MatchItem, TournamentCategory } from '../types';
import { SectionBackground, getSectionTextClass } from './SectionBackground';
import {
  Flame,
  Clock,
  MapPin,
  Calendar,
  ChevronRight,
  Shield,
  Activity,
  CheckCircle2
} from 'lucide-react';

export const LiveScoreSection: React.FC = () => {
  const { matches, categories: tourneyCategories, config, isInitialLoading } = useTournament();
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'LIVE' | 'UPCOMING'>('ALL');
  const [stageFilter, setStageFilter] = useState<'ALL' | 'KNOCKOUT' | 'GROUP'>('ALL');

  const bgConfig = config.sectionsBackgrounds?.liveScore;
  const isCustomImage = bgConfig?.mode === 'IMAGE';
  const isCustomColor = bgConfig?.mode === 'COLOR';

  const categoriesList = [
    { id: 'ALL', label: 'Semua Kategori' },
    ...tourneyCategories.map(c => ({ id: c.id, label: c.name })),
  ];

  const isKnockoutMatch = (m: (typeof matches)[0]) =>
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

  const hasRealTeams = (m: MatchItem) => {
    if (m.status === 'FINISHED') return true;
    return !isPlaceholderTeam(m.teamA) && !isPlaceholderTeam(m.teamB);
  };

  // Active / Upcoming matches only (FINISHED matches are archived to the bracket section)
  const activeAndUpcomingMatches = matches.filter(m => m.status !== 'FINISHED' && hasRealTeams(m));
  const liveMatches = matches.filter(m => m.status === 'LIVE' && hasRealTeams(m));
  const activeLiveMatch = liveMatches[0] || null;

  // Filtered and smart-sorted matches list (Prioritas: LIVE -> Babak Gugur -> Fase Grup)
  const filteredMatches = activeAndUpcomingMatches
    .filter(m => {
      const matchCat = selectedCategory === 'ALL' || m.category === selectedCategory;
      const matchStatus = statusFilter === 'ALL' || m.status === statusFilter;
      const isKo = isKnockoutMatch(m);
      const matchStage =
        stageFilter === 'ALL' ||
        (stageFilter === 'KNOCKOUT' && isKo) ||
        (stageFilter === 'GROUP' && !isKo);
      return matchCat && matchStatus && matchStage;
    })
    .sort((a, b) => {
      // 1. LIVE matches always first
      if (a.status === 'LIVE' && b.status !== 'LIVE') return -1;
      if (b.status === 'LIVE' && a.status !== 'LIVE') return 1;

      // 2. Knockout matches prioritized over Group matches
      const aIsKo = isKnockoutMatch(a);
      const bIsKo = isKnockoutMatch(b);
      if (aIsKo && !bIsKo) return -1;
      if (!aIsKo && bIsKo) return 1;

      // 3. Tanggal Kickoff
      const dateA = a.date || '';
      const dateB = b.date || '';
      if (dateA !== dateB) {
        return dateA.localeCompare(dateB);
      }

      // 4. Jam Kickoff
      const timeA = a.time || '';
      const timeB = b.time || '';
      if (timeA !== timeB) {
        return timeA.localeCompare(timeB);
      }

      // 5. Nomor Pertandingan
      return (a.matchNumber || 0) - (b.matchNumber || 0);
    });

  return (
    <section
      id="live-jadwal"
      className={`scroll-mt-24 py-16 relative overflow-hidden transition-colors duration-300 border-b border-slate-200 dark:border-slate-800 ${
        isCustomColor || isCustomImage ? '' : 'bg-slate-50 dark:bg-slate-900/60'
      }`}
      style={isCustomColor && bgConfig.bgColor ? { backgroundColor: bgConfig.bgColor } : undefined}
    >
      {/* CUSTOM SECTION BACKGROUND */}
      <SectionBackground config={bgConfig} />

      <div className={`relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 ${getSectionTextClass(bgConfig)}`}>
        
        {/* SECTION HEADER */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
          <div>
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-red-600/10 dark:bg-red-950/60 border border-red-500/30 text-red-600 dark:text-red-400 text-xs font-bold uppercase tracking-wider mb-2">
              <Flame className="w-3.5 h-3.5 animate-bounce" />
              <span>Pusat Informasi & Skor Pertandingan</span>
            </div>
            <h2 className="text-3xl sm:text-5xl font-heading font-bold uppercase tracking-tight text-slate-900 dark:text-white">
              LIVE SCORE & JADWAL MATCH
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
              Menampilkan pertandingan yang sedang berlangsung dan jadwal matchday mendatang.
            </p>
          </div>

          {/* STATUS TABS WITH LAYOUTID PILL */}
          <div className="flex items-center p-1 bg-slate-200 dark:bg-slate-950 rounded-xl border border-slate-300 dark:border-slate-800 self-start md:self-auto overflow-x-auto max-w-full relative">
            {(['ALL', 'LIVE', 'UPCOMING'] as const).map(st => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`relative px-3.5 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer z-10 ${
                  statusFilter === st
                    ? 'text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {statusFilter === st && (
                  <motion.div
                    layoutId="activeLiveScoreStatusTab"
                    className="absolute inset-0 bg-red-600 rounded-lg shadow-md -z-10"
                    transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                  />
                )}
                {st === 'ALL' && 'Semua Aktif'}
                {st === 'LIVE' && `🔴 Sedang Tanding (${liveMatches.length})`}
                {st === 'UPCOMING' && 'Akan Datang'}
              </button>
            ))}
          </div>
        </div>

        {/* ACTIVE LIVE MATCH BANNER (FEATURED) */}
        {activeLiveMatch && (
          <div className="mb-10 relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-red-950 border-2 border-red-600/50 shadow-2xl p-6 sm:p-8 text-white">
            <div className="absolute top-0 right-0 px-6 py-1.5 bg-red-600 text-white text-xs font-extrabold uppercase tracking-widest rounded-bl-xl shadow-lg flex items-center space-x-1.5 animate-pulse">
              <span className="w-2 h-2 rounded-full bg-white"></span>
              <span>LIVE MATCH IN PROGRESS</span>
            </div>

            <div className="flex flex-col lg:flex-row items-center justify-between gap-6">
              
              {/* MATCH INFO HEADER */}
              <div className="w-full lg:w-auto text-center lg:text-left">
                <span className="px-2.5 py-1 rounded-md bg-slate-800 text-xs font-bold text-red-400 border border-slate-700">
                  {activeLiveMatch.category} • {activeLiveMatch.round}
                </span>
                <p className="text-xs text-slate-400 mt-2 flex items-center justify-center lg:justify-start space-x-1">
                  <MapPin className="w-3.5 h-3.5 text-red-400" />
                  <span>{activeLiveMatch.pitch}</span>
                </p>
              </div>

              {/* TEAMS & SCORE BOARD */}
              <div className="flex items-center justify-center space-x-4 sm:space-x-8 w-full max-w-2xl">
                
                {/* TEAM A */}
                <div className="flex-1 text-center sm:text-right">
                  <div className="w-14 h-14 sm:w-16 sm:h-16 mx-auto sm:ml-auto rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center overflow-hidden shadow-inner mb-2 p-1.5">
                    {activeLiveMatch.teamA.logo ? (
                      <img
                        src={activeLiveMatch.teamA.logo}
                        alt={`Logo ${activeLiveMatch.teamA.name}`}
                        width="64"
                        height="64"
                        loading="lazy"
                        decoding="async"
                        className="max-h-full max-w-full object-contain"
                      />
                    ) : (
                      <span className="text-2xl">🛡️</span>
                    )}
                  </div>
                  <h4 className="text-base sm:text-xl font-bold text-white leading-tight">
                    {activeLiveMatch.teamA.name}
                  </h4>
                  <p className="text-[11px] text-slate-400 truncate">
                    {activeLiveMatch.teamA.institution || 'Official Team'}
                  </p>
                </div>

                {/* LIVE SCORE BOX */}
                <div className="shrink-0 text-center px-4 py-3 rounded-2xl bg-slate-950/80 border border-red-500/40 shadow-xl">
                  <div className="text-3xl sm:text-5xl font-heading font-extrabold text-white tracking-widest">
                    <span className="text-red-400">{activeLiveMatch.teamA.score ?? 0}</span>
                    <span className="mx-2 text-slate-500">-</span>
                    <span className="text-blue-400">{activeLiveMatch.teamB.score ?? 0}</span>
                  </div>
                  <div className="mt-1 px-2.5 py-0.5 rounded-full bg-red-950 border border-red-700/60 inline-flex items-center space-x-1">
                    <Activity className="w-3 h-3 text-red-400 animate-spin" />
                    <span className="text-[11px] font-bold text-red-300">
                      Menit {activeLiveMatch.liveMinute || "35'"}
                    </span>
                  </div>
                </div>

                {/* TEAM B */}
                <div className="flex-1 text-center sm:text-left">
                  <div className="w-14 h-14 sm:w-16 sm:h-16 mx-auto sm:mr-auto rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center overflow-hidden shadow-inner mb-2 p-1.5">
                    {activeLiveMatch.teamB.logo ? (
                      <img
                        src={activeLiveMatch.teamB.logo}
                        alt={`Logo ${activeLiveMatch.teamB.name}`}
                        width="64"
                        height="64"
                        loading="lazy"
                        decoding="async"
                        className="max-h-full max-w-full object-contain"
                      />
                    ) : (
                      <span className="text-2xl">⚽</span>
                    )}
                  </div>
                  <h4 className="text-base sm:text-xl font-bold text-white leading-tight">
                    {activeLiveMatch.teamB.name}
                  </h4>
                  <p className="text-[11px] text-slate-400 truncate">
                    {activeLiveMatch.teamB.institution || 'Official Team'}
                  </p>
                </div>

              </div>

            </div>
          </div>
        )}

        {/* CATEGORY SELECTOR PILLS */}
        <div className="flex items-center space-x-2 overflow-x-auto pb-2 scrollbar-none">
          {categoriesList.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer ${
                selectedCategory === cat.id
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-950 shadow-md'
                  : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* STAGE FILTER PILLS (BABAK GUGUR vs FASE GRUP) */}
        <div className="flex items-center space-x-2 overflow-x-auto pb-4 mb-6 scrollbar-none">
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mr-1 shrink-0 uppercase tracking-wider">
            Fase:
          </span>
          {[
            { id: 'ALL', label: 'Semua Pertandingan' },
            { id: 'KNOCKOUT', label: '⚡ Babak Gugur' },
            { id: 'GROUP', label: 'Fase Grup' },
          ].map(stg => (
            <button
              key={stg.id}
              type="button"
              onClick={() => setStageFilter(stg.id as any)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer ${
                stageFilter === stg.id
                  ? 'bg-red-600 text-white shadow-md shadow-red-600/30'
                  : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
              }`}
            >
              {stg.label}
            </button>
          ))}
        </div>

        {/* MATCHES GRID */}
        {isInitialLoading && filteredMatches.length === 0 ? (
          <div className="space-y-6">
            <div className="flex items-center justify-center space-x-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-600"></span>
              </span>
              <span>Menyinkronkan jadwal pertandingan & live score dari database...</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 animate-pulse">
              {[1, 2, 3].map(i => (
                <div
                  key={i}
                  className="rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-5 space-y-4 shadow-sm"
                >
                  <div className="flex justify-between items-center pb-3 border-b border-slate-100 dark:border-slate-800">
                    <div className="h-4 w-16 bg-slate-200 dark:bg-slate-800 rounded"></div>
                    <div className="h-4 w-24 bg-slate-200 dark:bg-slate-800 rounded"></div>
                  </div>
                  <div className="space-y-3 py-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2.5">
                        <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-800"></div>
                        <div className="h-4 w-28 bg-slate-200 dark:bg-slate-800 rounded"></div>
                      </div>
                      <div className="h-6 w-8 bg-slate-200 dark:bg-slate-800 rounded"></div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2.5">
                        <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-800"></div>
                        <div className="h-4 w-32 bg-slate-200 dark:bg-slate-800 rounded"></div>
                      </div>
                      <div className="h-6 w-8 bg-slate-200 dark:bg-slate-800 rounded"></div>
                    </div>
                  </div>
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-between">
                    <div className="h-3 w-20 bg-slate-200 dark:bg-slate-800 rounded"></div>
                    <div className="h-3 w-24 bg-slate-200 dark:bg-slate-800 rounded"></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : filteredMatches.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 space-y-3">
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              Tidak ada pertandingan live atau jadwal aktif pada filter kategori yang dipilih.
            </p>
            <p className="text-xs text-slate-400">
              Pertandingan yang telah selesai (Finished) diarsipkan ke bagian Bagan & Hasil Pertandingan.
            </p>
            <a
              href="#bagan"
              className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition"
            >
              <span>Lihat Bagan & Hasil Pertandingan</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </a>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredMatches.map(match => {
              const isLive = match.status === 'LIVE';

              return (
                <div
                  key={match.id}
                  id={`match-card-${match.id}`}
                  className={`group relative rounded-2xl transition-all duration-300 border hover:-translate-y-1.5 hover:shadow-xl ${
                    isLive
                      ? 'bg-gradient-to-b from-slate-950 to-red-950/40 border-red-500 shadow-lg shadow-red-950/40 text-white'
                      : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 hover:border-red-500/50 dark:hover:border-red-500/40 shadow-sm text-slate-900 dark:text-white'
                  } p-5 flex flex-col justify-between`}
                >
                  {/* CARD TOP INFO */}
                  <div className="flex items-center justify-between text-xs pb-3 border-b border-slate-100 dark:border-slate-800/80">
                    <div className="flex items-center space-x-2">
                      <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-red-100 dark:bg-red-950/80 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800">
                        {match.category}
                      </span>
                      <span className="font-semibold text-slate-500 dark:text-slate-400 text-[11px]">
                        {match.round}
                      </span>
                    </div>

                    <div>
                      {isLive ? (
                        <span className="inline-flex items-center space-x-1.5 text-red-500 dark:text-red-400 font-extrabold text-[11px]">
                          <span className="relative flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-600 shadow-[0_0_8px_#ef4444]"></span>
                          </span>
                          <span className="tracking-wider">LIVE {match.liveMinute || "35'"}</span>
                        </span>
                      ) : (
                        <span className="text-slate-500 dark:text-slate-400 text-[11px] font-medium flex items-center space-x-1">
                          <Clock className="w-3.5 h-3.5 text-blue-500" />
                          <span>{match.time} WIB</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* TEAMS VERSUS DISPLAY */}
                  <div className="py-4 space-y-3">
                    
                    {/* TEAM A */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2.5 flex-1 min-w-0 pr-2">
                        <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center overflow-hidden text-sm shrink-0 p-0.5">
                          {match.teamA.logo ? (
                            <img
                              src={match.teamA.logo}
                              alt={`Logo ${match.teamA.name}`}
                              width="32"
                              height="32"
                              loading="lazy"
                              decoding="async"
                              className="max-h-full max-w-full object-contain"
                            />
                          ) : (
                            <span>🛡️</span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-sm truncate leading-tight">
                            {match.teamA.name}
                          </p>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                            {match.teamA.institution || '-'}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        {isLive && (
                          <span className="text-xl font-heading font-extrabold px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 group-hover:scale-110 inline-block transition-transform duration-200">
                            {match.teamA.score ?? 0}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* TEAM B */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2.5 flex-1 min-w-0 pr-2">
                        <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center overflow-hidden text-sm shrink-0 p-0.5">
                          {match.teamB.logo ? (
                            <img
                              src={match.teamB.logo}
                              alt={`Logo ${match.teamB.name}`}
                              width="32"
                              height="32"
                              loading="lazy"
                              decoding="async"
                              className="max-h-full max-w-full object-contain"
                            />
                          ) : (
                            <span>⚽</span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-sm truncate leading-tight">
                            {match.teamB.name}
                          </p>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                            {match.teamB.institution || '-'}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        {isLive && (
                          <span className="text-xl font-heading font-extrabold px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 group-hover:scale-110 inline-block transition-transform duration-200">
                            {match.teamB.score ?? 0}
                          </span>
                        )}
                      </div>
                    </div>

                  </div>

                  {/* CARD BOTTOM META */}
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                    <div className="flex items-center space-x-1.5 truncate">
                      <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{match.date}</span>
                    </div>
                    <div className="flex items-center space-x-1.5 truncate">
                      <MapPin className="w-3.5 h-3.5 text-red-500 shrink-0" />
                      <span className="truncate">{match.pitch}</span>
                    </div>
                  </div>

                </div>
              );
            })}
          </div>
        )}

        {/* BOTTOM HELPER BANNER */}
        <div className="mt-8 p-4 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="flex items-center space-x-2.5 text-slate-600 dark:text-slate-400">
            <span className="text-lg">🏆</span>
            <span>
              Seluruh skor hasil pertandingan yang telah <strong>selesai (Finished)</strong> dan skema lolos otomatis tersimpan di <strong>Bagan Knockout Bracket</strong>.
            </span>
          </div>
          <a
            href="#bagan"
            className="px-3.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold flex items-center space-x-1 transition shrink-0"
          >
            <span>Buka Bagan Bracket</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </a>
        </div>

      </div>
    </section>
  );
};
