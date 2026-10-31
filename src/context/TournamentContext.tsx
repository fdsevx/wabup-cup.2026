import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import {
  AdminUser,
  CategoryDetail,
  CommitteeBankAccount,
  CommitteeContact,
  CommitteeEmail,
  DownloadableDoc,
  MatchItem,
  MatchEvent,
  MatchStatus,
  RegistrationItem,
  RegistrationStatus,
  PaymentStatus,
  SponsorItem,
  TournamentCategory,
  TournamentConfig,
  PlayerItem,
  GroupStageItem,
  GroupTeamItem,
  TeamStandingItem,
} from '../types';
import {
  DEFAULT_ADMIN_USERS,
  DEFAULT_CATEGORIES,
  DEFAULT_TOURNAMENT_CONFIG,
  DEFAULT_SECTIONS_VISIBILITY,
} from '../data/defaultConfig';
import { ApiService } from '../services/api';
import {
  safeLocalStorageGet,
  safeLocalStorageSet,
  sanitizeRegistrationsForLocalStorage,
  idbGetRegistrations,
  idbSaveRegistrations,
  idbSaveRegistration,
  idbDeleteRegistration,
} from '../utils/storage';
import { generateUniqueRegCode } from '../utils/registrationCode';
import { deleteMediaFromStorage } from '../utils/blobUpload';

// Helpers to purge legacy mock items from browser local cache
const filterOutMockRegistrations = (list: RegistrationItem[]): RegistrationItem[] => {
  if (!Array.isArray(list)) return [];
  return list.filter(r => !r.id || !/^reg-00\d$/.test(r.id));
};

const filterOutMockMatches = (list: MatchItem[]): MatchItem[] => {
  if (!Array.isArray(list)) return [];
  return list.filter(m => !m.id || (!m.id.startsWith('match-live-') && !m.id.startsWith('match-up-') && !m.id.startsWith('match-fin-')));
};

const filterOutMockSponsors = (list: SponsorItem[]): SponsorItem[] => {
  if (!Array.isArray(list)) return [];
  return list.filter(s => s && s.name && s.name !== '-' && s.id !== '-' && !/^sp-0\d$/.test(s.id));
};

export const computeStandingsFromData = (
  matchesList: MatchItem[],
  groupsList: GroupStageItem[],
  registrationsList: RegistrationItem[],
  targetCategory?: string
): Record<string, TeamStandingItem[]> => {
  const result: Record<string, TeamStandingItem[]> = {};

  const filteredMatches = matchesList.filter(m => {
    if (targetCategory && m.category !== targetCategory) return false;
    return !!m.group;
  });

  const groupKeys = new Set<string>();
  for (const g of groupsList) {
    if (!targetCategory || g.category === targetCategory) {
      groupKeys.add(`${g.category}:::${g.groupName}`);
    }
  }
  for (const m of filteredMatches) {
    if (m.group) {
      groupKeys.add(`${m.category}:::${m.group}`);
    }
  }

  for (const key of groupKeys) {
    const [cat, grpName] = key.split(':::');
    const grpMatches = filteredMatches.filter(m => m.category === cat && m.group === grpName);
    const grpObj = groupsList.find(g => g.category === cat && g.groupName === grpName);

    const teamMap = new Map<string, TeamStandingItem>();

    const findTeamReg = (name: string, institution?: string) => {
      const normName = (name || '').trim().toLowerCase();
      const normInst = (institution || '').trim().toLowerCase();
      if (!normName && !normInst) return undefined;
      return (
        registrationsList.find(r => 
          (cat ? r.category === cat : true) &&
          ((normName && r.teamName?.trim().toLowerCase() === normName) ||
           (normName && r.institutionName?.trim().toLowerCase() === normName) ||
           (normInst && r.teamName?.trim().toLowerCase() === normInst) ||
           (normInst && r.institutionName?.trim().toLowerCase() === normInst))
        ) ||
        registrationsList.find(r => 
          (normName && r.teamName?.trim().toLowerCase() === normName) ||
          (normName && r.institutionName?.trim().toLowerCase() === normName) ||
          (normInst && r.teamName?.trim().toLowerCase() === normInst) ||
          (normInst && r.institutionName?.trim().toLowerCase() === normInst)
        )
      );
    };

    if (grpObj && Array.isArray(grpObj.teams)) {
      for (const t of grpObj.teams) {
        const reg = findTeamReg(t.name, t.institution);
        const resolvedLogo = reg?.teamLogo || (reg?.documents as any)?.logoTim?.url || (reg?.documents as any)?.logoTim?.fileData || t.logo || '';
        const resolvedInst = t.institution || reg?.institutionName || '';

        if (!teamMap.has(t.name)) {
          teamMap.set(t.name, {
            position: 0,
            teamName: t.name,
            institution: resolvedInst,
            teamLogo: resolvedLogo,
            groupName: grpName,
            category: cat,
            played: 0,
            won: 0,
            drawn: 0,
            lost: 0,
            goalsFor: 0,
            goalsAgainst: 0,
            goalDifference: 0,
            points: 0,
          });
        } else {
          const item = teamMap.get(t.name)!;
          if (resolvedLogo && (!item.teamLogo || item.teamLogo !== resolvedLogo)) {
            item.teamLogo = resolvedLogo;
          }
          if (resolvedInst && !item.institution) {
            item.institution = resolvedInst;
          }
        }
      }
    }

    for (const m of grpMatches) {
      for (const team of [m.teamA, m.teamB]) {
        const reg = findTeamReg(team.name, team.institution);
        const resolvedLogo = reg?.teamLogo || (reg?.documents as any)?.logoTim?.url || (reg?.documents as any)?.logoTim?.fileData || team.logo || '';
        const resolvedInst = team.institution || reg?.institutionName || '';

        if (!teamMap.has(team.name)) {
          teamMap.set(team.name, {
            position: 0,
            teamName: team.name,
            institution: resolvedInst,
            teamLogo: resolvedLogo,
            groupName: grpName,
            category: cat,
            played: 0,
            won: 0,
            drawn: 0,
            lost: 0,
            goalsFor: 0,
            goalsAgainst: 0,
            goalDifference: 0,
            points: 0,
          });
        } else {
          const item = teamMap.get(team.name)!;
          if (resolvedLogo && (!item.teamLogo || item.teamLogo !== resolvedLogo)) {
            item.teamLogo = resolvedLogo;
          }
          if (resolvedInst && !item.institution) {
            item.institution = resolvedInst;
          }
        }
      }

      const hasScore = m.status !== 'UPCOMING' && m.teamA.score !== undefined && m.teamB.score !== undefined;
      if (hasScore) {
        const itemA = teamMap.get(m.teamA.name);
        const itemB = teamMap.get(m.teamB.name);

        if (itemA && itemB) {
          const sA = Number(m.teamA.score) || 0;
          const sB = Number(m.teamB.score) || 0;

          itemA.played += 1;
          itemB.played += 1;

          itemA.goalsFor += sA;
          itemA.goalsAgainst += sB;
          itemB.goalsFor += sB;
          itemB.goalsAgainst += sA;

          if (sA > sB) {
            itemA.won += 1;
            itemA.points += 3;
            itemB.lost += 1;
          } else if (sA < sB) {
            itemB.won += 1;
            itemB.points += 3;
            itemA.lost += 1;
          } else {
            itemA.drawn += 1;
            itemA.points += 1;
            itemB.drawn += 1;
            itemB.points += 1;
          }

          itemA.goalDifference = itemA.goalsFor - itemA.goalsAgainst;
          itemB.goalDifference = itemB.goalsFor - itemB.goalsAgainst;
        }
      }
    }

    const sorted = Array.from(teamMap.values()).sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
      if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
      return a.teamName.localeCompare(b.teamName);
    });

    sorted.forEach((item, idx) => {
      item.position = idx + 1;
    });

    result[key] = sorted;
  }

  return result;
};

interface TournamentContextType {
  theme: 'dark' | 'light';
  toggleTheme: () => void;
  config: TournamentConfig;
  updateConfig: (newConfig: Partial<TournamentConfig>) => void;
  refreshConfig: () => Promise<void>;
  refreshDataFromServer: () => Promise<void>;
  isSyncingWithServer: boolean;
  isInitialLoading: boolean;
  isLoadingCategories: boolean;
  // Downloadable Documents
  downloadableDocs: DownloadableDoc[];
  addDownloadableDoc: (doc: Omit<DownloadableDoc, 'id' | 'updatedAt'>) => void;
  updateDownloadableDoc: (doc: DownloadableDoc) => void;
  deleteDownloadableDoc: (id: string) => void;
  // Committee Contacts
  committeeContacts: CommitteeContact[];
  addCommitteeContact: (contact: Omit<CommitteeContact, 'id'>) => void;
  updateCommitteeContact: (contact: CommitteeContact) => void;
  deleteCommitteeContact: (id: string) => void;
  setPrimaryCommitteeContact: (id: string) => void;
  // Committee Emails
  committeeEmails: CommitteeEmail[];
  addCommitteeEmail: (email: Omit<CommitteeEmail, 'id'>) => void;
  updateCommitteeEmail: (email: CommitteeEmail) => void;
  deleteCommitteeEmail: (id: string) => void;
  // Committee Bank Accounts
  bankAccounts: CommitteeBankAccount[];
  addBankAccount: (bank: Omit<CommitteeBankAccount, 'id'>) => void;
  updateBankAccount: (bank: CommitteeBankAccount) => void;
  deleteBankAccount: (id: string) => void;
  setPrimaryBankAccount: (id: string) => void;
  // Categories & Registration
  categories: CategoryDetail[];
  addCategory: (category: CategoryDetail) => void;
  updateCategory: (category: CategoryDetail) => void;
  deleteCategory: (categoryId: string) => void;
  reorderCategories: (newCategories: CategoryDetail[]) => Promise<void>;
  syncCategoryQuotas: () => Promise<void>;
  refreshCategoryQuotas: (force?: boolean) => Promise<Array<{ id: string; maxTeams: number; registeredTeamsCount: number }> | null>;
  registrations: RegistrationItem[];
  submitNewRegistration: (data: Omit<RegistrationItem, 'id' | 'regCode' | 'registrationDate' | 'status' | 'paymentStatus' | 'lastUpdated'>) => Promise<RegistrationItem>;
  updateRegistration: (item: RegistrationItem) => void;
  updateRegistrationStatus: (id: string, status: RegistrationStatus, reason?: string, notes?: string) => void;
  updatePaymentStatus: (id: string, paymentStatus: PaymentStatus) => void;
  deleteRegistration: (id: string) => void;
  matches: MatchItem[];
  addMatch: (match: Omit<MatchItem, 'id'>) => void;
  updateMatch: (match: MatchItem) => void;
  deleteMatch: (matchId: string) => void;
  refreshMatches: () => Promise<void>;
  randomizeMatchesForCategory: (
    category: TournamentCategory,
    stageOption?: 'AUTO' | 'PENYISIHAN' | '16_BESAR' | '8_BESAR' | 'SEMIFINAL'
  ) => { success: boolean; message: string; matches?: MatchItem[] };
  checkCanDrawNextRound: (category: TournamentCategory) => {
    canDraw: boolean;
    pendingMatchesCount: number;
    currentRoundName?: string;
    completedMatchesCount: number;
    totalMatchesCount: number;
  };
  sponsors: SponsorItem[];
  addSponsor: (sponsor: Omit<SponsorItem, 'id'>) => void;
  updateSponsor: (sponsor: SponsorItem) => void;
  deleteSponsor: (id: string) => void;
  adminUsers: AdminUser[];
  currentAdmin: AdminUser | null;
  loginAdmin: (username: string, pass: string) => Promise<{ success: boolean; message?: string; admin?: AdminUser }>;
  logoutAdmin: () => void;
  addAdminUser: (user: Omit<AdminUser, 'id' | 'createdAt'> & { password?: string }) => Promise<{ success: boolean; savedToDatabase?: boolean; error?: string }>;
  updateAdminUser: (user: AdminUser & { password?: string }) => Promise<{ success: boolean; savedToDatabase?: boolean; error?: string }>;
  deleteAdminUser: (id: string) => Promise<{ success: boolean; savedToDatabase?: boolean; error?: string }>;
  resetAllDataToDefaults: () => void;
  getWhatsAppNotificationUrl: (item: RegistrationItem, type: 'CONFIRMATION' | 'APPROVED' | 'REJECTED' | 'PAYMENT_REMINDER' | 'INVOICE') => string;
  // Groups, Standings & Players
  groups: GroupStageItem[];
  saveGroupStagesForCategory: (category: TournamentCategory, newGroups: GroupStageItem[]) => Promise<void>;
  randomizeGroupStage: (category: TournamentCategory, teamsPerGroup?: number) => { success: boolean; message: string; groups?: GroupStageItem[]; matches?: MatchItem[] };
  generateMatchesFromGroups: (category: TournamentCategory) => { success: boolean; message: string; matches?: MatchItem[] };
  moveTeamBetweenGroups: (category: TournamentCategory, sourceGroup: string, targetGroup: string, teamName: string) => void;
  addTeamToGroup: (category: TournamentCategory, groupName: string, team: GroupTeamItem) => void;
  removeTeamFromGroup: (category: TournamentCategory, groupName: string, teamName: string) => void;
  addGroup: (category: TournamentCategory, groupName: string) => void;
  deleteGroup: (category: TournamentCategory, groupName: string) => void;
  resetCategoryGroupsAndMatches: (category: TournamentCategory) => Promise<{ success: boolean; message: string }>;
  syncKnockoutFromStandings: (category: TournamentCategory | 'ALL') => Promise<{ success: boolean; message: string; updatedCount?: number }>;

  players: PlayerItem[];
  refreshPlayers: (hasStatsOnly?: boolean) => Promise<void>;
  savePlayer: (player: PlayerItem) => Promise<PlayerItem>;
  batchImportPlayers: (players: PlayerItem[]) => Promise<{ success: boolean; count: number }>;
  deletePlayer: (id: string) => Promise<void>;

  standings: Record<string, TeamStandingItem[]>;
  refreshStandings: () => Promise<void>;
  updateMatchLiveScore: (
    matchId: string,
    scoreA?: number,
    scoreB?: number,
    status?: MatchStatus,
    liveMinute?: string,
    events?: MatchEvent[]
  ) => Promise<void>;

  // Database status and synchronization
  dbStatus: {
    connected: boolean;
    host: string;
    database: string;
    error: string | null;
    mode: 'MYSQL_REAL' | 'MEMORY_FALLBACK';
  };
  checkDbStatus: () => Promise<any>;
}

const TournamentContext = createContext<TournamentContextType | undefined>(undefined);

export const TournamentProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Theme state
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('wabupcup_theme') : null;
    return saved === 'light' ? 'light' : 'dark';
  });

  useEffect(() => {
    safeLocalStorageSet('wabupcup_theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    }
  }, [theme]);

  // Sync theme changes across browser tabs/windows
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'wabupcup_theme' && (e.newValue === 'dark' || e.newValue === 'light')) {
        setTheme(e.newValue);
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  const DEFAULT_SECTIONS_VISIBILITY = {
    hero: true,
    liveScore: true,
    categories: true,
    bracket: true,
    venue: true,
    sponsors: true,
  };

  // Tournament Config
  const [config, setConfig] = useState<TournamentConfig>(() => {
    const parsed = safeLocalStorageGet<Partial<TournamentConfig> | null>('wabupcup_config', null);
    if (parsed) {
      return {
        ...DEFAULT_TOURNAMENT_CONFIG,
        ...parsed,
        wabupLogoUrl: parsed.wabupLogoUrl || DEFAULT_TOURNAMENT_CONFIG.wabupLogoUrl,
        sectionsVisibility: {
          ...DEFAULT_SECTIONS_VISIBILITY,
          ...(parsed.sectionsVisibility || {}),
        },
        sectionsBackgrounds: {
          ...(DEFAULT_TOURNAMENT_CONFIG.sectionsBackgrounds || {}),
          ...(parsed.sectionsBackgrounds || {}),
        },
        // Never restore dummy bank account or dummy fallback arrays
        bankAccount: undefined,
        downloadableDocs: Array.isArray(parsed.downloadableDocs) ? parsed.downloadableDocs : [],
        committeeContacts: Array.isArray(parsed.committeeContacts) ? parsed.committeeContacts : [],
        committeeEmails: Array.isArray(parsed.committeeEmails) ? parsed.committeeEmails : [],
        bankAccounts: Array.isArray(parsed.bankAccounts) ? parsed.bankAccounts : [],
      };
    }
    return {
      ...DEFAULT_TOURNAMENT_CONFIG,
      sectionsVisibility: DEFAULT_SECTIONS_VISIBILITY,
    };
  });

  // Database Status & Synchronization
  const [dbStatus, setDbStatus] = useState<{
    connected: boolean;
    host: string;
    database: string;
    error: string | null;
    mode: 'MYSQL_REAL' | 'MEMORY_FALLBACK';
  }>({
    connected: false,
    host: 'Memeriksa...',
    database: 'wabupcup2026',
    error: null,
    mode: 'MEMORY_FALLBACK',
  });

  const checkDbStatus = useCallback(async () => {
    try {
      const health = await ApiService.checkHealth();
      if (health && health.database) {
        setDbStatus(health.database);
        return health.database;
      }
    } catch (err: any) {
      console.warn('Could not check database health:', err);
    }
    return dbStatus;
  }, [dbStatus]);

  // Sync with Backend (MySQL / Node API)
  const [isSyncingWithServer, setIsSyncingWithServer] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  const refreshDataFromServer = useCallback(async () => {
    try {
      setIsSyncingWithServer(true);
      const isAdminLoggedIn = !!safeLocalStorageGet('wabupcup_current_admin', null) || !!safeLocalStorageGet('wabupcup_admin_token', null);
      const [serverConfig, serverCategories, serverRegistrations, serverMatches, serverSponsors, serverAdmins, serverPlayers, serverGroups, health, authCheck] =
        await Promise.all([
          ApiService.getConfig(),
          ApiService.getCategories(),
          ApiService.getRegistrations(isAdminLoggedIn),
          ApiService.getMatches(),
          ApiService.getSponsors(),
          ApiService.getAdmins(isAdminLoggedIn),
          (isAdminLoggedIn ? ApiService.getPlayers() : ApiService.getPlayers(undefined, undefined, false, true)).catch(() => []),
          ApiService.getGroups().catch(() => []),
          (isAdminLoggedIn ? ApiService.checkHealth() : Promise.resolve(null)).catch(() => null),
          (isAdminLoggedIn ? ApiService.getAuthMe() : Promise.resolve(null)).catch(() => null),
        ]);

      if (health && health.database) {
        setDbStatus(health.database);
      }

      if (authCheck) {
        const isAuth = Boolean(authCheck.authenticated || (authCheck as any).success);
        if (isAuth && authCheck.user) {
          setCurrentAdmin(authCheck.user);
          safeLocalStorageSet('wabupcup_current_admin', JSON.stringify(authCheck.user));
        } else if (!isAuth && safeLocalStorageGet('wabupcup_current_admin', null)) {
          setCurrentAdmin(null);
          if (typeof window !== 'undefined') {
            localStorage.removeItem('wabupcup_current_admin');
            localStorage.removeItem('wabupcup_admin_token');
          }
        }
      }

      if (serverConfig) {
        setConfig(prev => {
          const merged: TournamentConfig = {
            ...prev,
            ...serverConfig,
            sectionsVisibility: {
              ...DEFAULT_SECTIONS_VISIBILITY,
              ...(serverConfig.sectionsVisibility || prev.sectionsVisibility || {}),
            },
            sectionsBackgrounds: {
              ...(prev.sectionsBackgrounds || {}),
              ...(serverConfig.sectionsBackgrounds || {}),
            },
            downloadableDocs:
              serverConfig.downloadableDocs !== undefined && Array.isArray(serverConfig.downloadableDocs)
                ? serverConfig.downloadableDocs
                : (prev.downloadableDocs || []),
            committeeContacts:
              serverConfig.committeeContacts !== undefined && Array.isArray(serverConfig.committeeContacts)
                ? serverConfig.committeeContacts
                : (prev.committeeContacts || []),
            committeeEmails:
              serverConfig.committeeEmails !== undefined && Array.isArray(serverConfig.committeeEmails)
                ? serverConfig.committeeEmails
                : (prev.committeeEmails || []),
            bankAccounts:
              serverConfig.bankAccounts !== undefined && Array.isArray(serverConfig.bankAccounts)
                ? serverConfig.bankAccounts
                : (prev.bankAccounts || []),
          };
          safeLocalStorageSet('wabupcup_config', JSON.stringify(merged));
          return merged;
        });
      }

      if (serverCategories && Array.isArray(serverCategories)) {
        setCategories(serverCategories);
        safeLocalStorageSet('wabupcup_categories', JSON.stringify(serverCategories));
      }

      if (serverRegistrations && Array.isArray(serverRegistrations)) {
        setRegistrations(serverRegistrations);
        idbSaveRegistrations(serverRegistrations).catch(() => {});
        safeLocalStorageSet('wabupcup_registrations', JSON.stringify(sanitizeRegistrationsForLocalStorage(serverRegistrations)));
      }

      if (serverMatches && Array.isArray(serverMatches)) {
        setMatches(serverMatches);
        safeLocalStorageSet('wabupcup_matches', JSON.stringify(serverMatches));
      }

      if (serverSponsors && Array.isArray(serverSponsors)) {
        setSponsors(serverSponsors);
        safeLocalStorageSet('wabupcup_sponsors', JSON.stringify(serverSponsors));
      }

      if (serverAdmins && Array.isArray(serverAdmins) && serverAdmins.length > 0) {
        setAdminUsers(serverAdmins);
        safeLocalStorageSet('wabupcup_admins', JSON.stringify(serverAdmins));
      }

      if (serverPlayers && Array.isArray(serverPlayers)) {
        setPlayers(serverPlayers);
        safeLocalStorageSet('wabupcup_players', JSON.stringify(serverPlayers));
      }

      if (serverGroups && Array.isArray(serverGroups)) {
        setGroups(serverGroups);
        safeLocalStorageSet('wabupcup_groups', JSON.stringify(serverGroups));
      }
    } catch (err) {
      console.warn('Backend server synchronization encountered an error, running with local data:', err);
    } finally {
      setIsSyncingWithServer(false);
      setIsInitialLoading(false);
    }
  }, []);

  const refreshConfig = useCallback(async () => {
    try {
      const serverConfig = await ApiService.getConfig();
      if (serverConfig) {
        setConfig(prev => {
          const merged: TournamentConfig = {
            ...prev,
            ...serverConfig,
            sectionsVisibility: {
              ...DEFAULT_SECTIONS_VISIBILITY,
              ...(serverConfig.sectionsVisibility || prev.sectionsVisibility || {}),
            },
            sectionsBackgrounds: {
              ...(prev.sectionsBackgrounds || {}),
              ...(serverConfig.sectionsBackgrounds || {}),
            },
            downloadableDocs:
              serverConfig.downloadableDocs !== undefined && Array.isArray(serverConfig.downloadableDocs)
                ? serverConfig.downloadableDocs
                : (prev.downloadableDocs || []),
            committeeContacts:
              serverConfig.committeeContacts !== undefined && Array.isArray(serverConfig.committeeContacts)
                ? serverConfig.committeeContacts
                : (prev.committeeContacts || []),
            committeeEmails:
              serverConfig.committeeEmails !== undefined && Array.isArray(serverConfig.committeeEmails)
                ? serverConfig.committeeEmails
                : (prev.committeeEmails || []),
            bankAccounts:
              serverConfig.bankAccounts !== undefined && Array.isArray(serverConfig.bankAccounts)
                ? serverConfig.bankAccounts
                : (prev.bankAccounts || []),
          };
          safeLocalStorageSet('wabupcup_config', JSON.stringify(merged));
          return merged;
        });
      }
    } catch (err) {
      console.warn('Could not refresh config from server:', err);
    }
  }, []);

  // Initial load from server on app mount
  useEffect(() => {
    refreshDataFromServer();
  }, [refreshDataFromServer]);

  const updateConfig = (newConfig: Partial<TournamentConfig>) => {
    setConfig(prev => {
      const updated = { ...prev, ...newConfig };
      safeLocalStorageSet('wabupcup_config', JSON.stringify(updated));
      // Send only partial newConfig to backend so massive background images are never resent on small config edits
      ApiService.updateConfig(newConfig).catch(err =>
        console.warn('Could not sync config update to backend API:', err)
      );
      return updated;
    });
  };

  // Downloadable Documents Methods
  const downloadableDocs = config.downloadableDocs || [];

  const addDownloadableDoc = (doc: Omit<DownloadableDoc, 'id' | 'updatedAt'>) => {
    const now = new Date();
    const formattedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const newDoc: DownloadableDoc = {
      ...doc,
      id: `doc-${Date.now()}`,
      updatedAt: formattedDate,
    };
    const nextDocs = [newDoc, ...downloadableDocs];
    updateConfig({ downloadableDocs: nextDocs });
  };

  const updateDownloadableDoc = (updated: DownloadableDoc) => {
    const now = new Date();
    const formattedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const nextDocs = downloadableDocs.map(d =>
      d.id === updated.id ? { ...updated, updatedAt: formattedDate } : d
    );
    updateConfig({ downloadableDocs: nextDocs });
  };

  const deleteDownloadableDoc = (id: string) => {
    const nextDocs = downloadableDocs.filter(d => d.id !== id);
    updateConfig({ downloadableDocs: nextDocs });
  };

  // Committee Contacts (WhatsApp) Methods
  const committeeContacts = config.committeeContacts || [];

  const addCommitteeContact = (contact: Omit<CommitteeContact, 'id'>) => {
    const newContact: CommitteeContact = {
      ...contact,
      id: `wa-${Date.now()}`,
    };
    let nextContacts = [...committeeContacts, newContact];
    if (newContact.isPrimary || committeeContacts.length === 0) {
      nextContacts = nextContacts.map(c => ({
        ...c,
        isPrimary: c.id === newContact.id,
      }));
      updateConfig({
        committeeContacts: nextContacts,
        adminContactPhone: newContact.phone.replace(/\D/g, ''),
      });
    } else {
      updateConfig({ committeeContacts: nextContacts });
    }
  };

  const updateCommitteeContact = (updated: CommitteeContact) => {
    let nextContacts = committeeContacts.map(c =>
      c.id === updated.id ? updated : updated.isPrimary ? { ...c, isPrimary: false } : c
    );
    const primary = nextContacts.find(c => c.isPrimary) || nextContacts[0];
    updateConfig({
      committeeContacts: nextContacts,
      adminContactPhone: primary ? primary.phone.replace(/\D/g, '') : config.adminContactPhone,
    });
  };

  const deleteCommitteeContact = (id: string) => {
    const nextContacts = committeeContacts.filter(c => c.id !== id);
    if (nextContacts.length > 0 && !nextContacts.some(c => c.isPrimary)) {
      nextContacts[0].isPrimary = true;
    }
    const primary = nextContacts.find(c => c.isPrimary);
    updateConfig({
      committeeContacts: nextContacts,
      adminContactPhone: primary ? primary.phone.replace(/\D/g, '') : config.adminContactPhone,
    });
  };

  const setPrimaryCommitteeContact = (id: string) => {
    const nextContacts = committeeContacts.map(c => ({
      ...c,
      isPrimary: c.id === id,
    }));
    const primary = nextContacts.find(c => c.id === id);
    updateConfig({
      committeeContacts: nextContacts,
      adminContactPhone: primary ? primary.phone.replace(/\D/g, '') : config.adminContactPhone,
    });
  };

  // Committee Emails Methods
  const committeeEmails = config.committeeEmails || [];

  const addCommitteeEmail = (emailItem: Omit<CommitteeEmail, 'id'>) => {
    const newEmail: CommitteeEmail = {
      ...emailItem,
      id: `em-${Date.now()}`,
    };
    let nextEmails = [...committeeEmails, newEmail];
    if (newEmail.isPrimary || committeeEmails.length === 0) {
      nextEmails = nextEmails.map(e => ({
        ...e,
        isPrimary: e.id === newEmail.id,
      }));
      updateConfig({
        committeeEmails: nextEmails,
        adminContactEmail: newEmail.email,
      });
    } else {
      updateConfig({ committeeEmails: nextEmails });
    }
  };

  const updateCommitteeEmail = (updated: CommitteeEmail) => {
    let nextEmails = committeeEmails.map(e =>
      e.id === updated.id ? updated : updated.isPrimary ? { ...e, isPrimary: false } : e
    );
    const primary = nextEmails.find(e => e.isPrimary) || nextEmails[0];
    updateConfig({
      committeeEmails: nextEmails,
      adminContactEmail: primary ? primary.email : config.adminContactEmail,
    });
  };

  const deleteCommitteeEmail = (id: string) => {
    const nextEmails = committeeEmails.filter(e => e.id !== id);
    if (nextEmails.length > 0 && !nextEmails.some(e => e.isPrimary)) {
      nextEmails[0].isPrimary = true;
    }
    const primary = nextEmails.find(e => e.isPrimary);
    updateConfig({
      committeeEmails: nextEmails,
      adminContactEmail: primary ? primary.email : config.adminContactEmail,
    });
  };

  // Committee Bank Accounts Methods
  const bankAccounts = config.bankAccounts || [];

  const addBankAccount = (bank: Omit<CommitteeBankAccount, 'id'>) => {
    const newBank: CommitteeBankAccount = {
      ...bank,
      id: `bank-${Date.now()}`,
    };
    let nextBanks = [...bankAccounts, newBank];
    if (newBank.isPrimary || bankAccounts.length === 0) {
      nextBanks = nextBanks.map(b => ({
        ...b,
        isPrimary: b.id === newBank.id,
      }));
      updateConfig({
        bankAccounts: nextBanks,
        bankAccount: {
          bankName: newBank.bankName,
          accountNumber: newBank.accountNumber,
          accountHolder: newBank.accountHolder,
        },
      });
    } else {
      updateConfig({ bankAccounts: nextBanks });
    }
  };

  const updateBankAccount = (updated: CommitteeBankAccount) => {
    let nextBanks = bankAccounts.map(b =>
      b.id === updated.id ? updated : updated.isPrimary ? { ...b, isPrimary: false } : b
    );
    const primary = nextBanks.find(b => b.isPrimary) || nextBanks[0];
    updateConfig({
      bankAccounts: nextBanks,
      bankAccount: primary
        ? {
            bankName: primary.bankName,
            accountNumber: primary.accountNumber,
            accountHolder: primary.accountHolder,
          }
        : config.bankAccount,
    });
  };

  const deleteBankAccount = (id: string) => {
    const nextBanks = bankAccounts.filter(b => b.id !== id);
    if (nextBanks.length > 0 && !nextBanks.some(b => b.isPrimary)) {
      nextBanks[0].isPrimary = true;
    }
    const primary = nextBanks.find(b => b.isPrimary);
    updateConfig({
      bankAccounts: nextBanks,
      bankAccount: primary
        ? {
            bankName: primary.bankName,
            accountNumber: primary.accountNumber,
            accountHolder: primary.accountHolder,
          }
        : config.bankAccount,
    });
  };

  const setPrimaryBankAccount = (id: string) => {
    const nextBanks = bankAccounts.map(b => ({
      ...b,
      isPrimary: b.id === id,
    }));
    const primary = nextBanks.find(b => b.id === id);
    updateConfig({
      bankAccounts: nextBanks,
      bankAccount: primary
        ? {
            bankName: primary.bankName,
            accountNumber: primary.accountNumber,
            accountHolder: primary.accountHolder,
          }
        : config.bankAccount,
    });
  };

  // Categories & Prizes
  const [categories, setCategories] = useState<CategoryDetail[]>(() => {
    return safeLocalStorageGet<CategoryDetail[]>('wabupcup_categories', DEFAULT_CATEGORIES);
  });

  const addCategory = (newCat: CategoryDetail) => {
    setCategories(prev => {
      const next = [...prev, newCat];
      safeLocalStorageSet('wabupcup_categories', JSON.stringify(next));
      ApiService.saveCategory(newCat).catch(err =>
        console.warn('Could not save category to backend:', err)
      );
      return next;
    });
  };

  const updateCategory = (updated: CategoryDetail) => {
    setCategories(prev => {
      const next = prev.map(c => (c.id === updated.id ? updated : c));
      safeLocalStorageSet('wabupcup_categories', JSON.stringify(next));
      ApiService.saveCategory(updated).catch(err =>
        console.warn('Could not update category on backend:', err)
      );
      return next;
    });
  };

  const deleteCategory = (categoryId: string) => {
    setCategories(prev => {
      const next = prev.filter(c => c.id !== categoryId);
      safeLocalStorageSet('wabupcup_categories', JSON.stringify(next));
      ApiService.deleteCategory(categoryId).catch(err =>
        console.warn('Could not delete category on backend:', err)
      );
      return next;
    });
  };

  const reorderCategories = async (newCategories: CategoryDetail[]) => {
    setCategories(newCategories);
    safeLocalStorageSet('wabupcup_categories', JSON.stringify(newCategories));
    try {
      await ApiService.reorderCategories(newCategories);
    } catch (err) {
      console.warn('Could not sync reordered categories to backend:', err);
    }
  };

  const lastQuotaFetchTimeRef = useRef<number>(0);

  const refreshCategoryQuotas = useCallback(async (force = false): Promise<Array<{ id: string; maxTeams: number; registeredTeamsCount: number }> | null> => {
    const now = Date.now();
    if (!force && (now - lastQuotaFetchTimeRef.current < 15000)) {
      return null;
    }

    try {
      const quotas = await ApiService.getCategoryQuotas();
      if (quotas && Array.isArray(quotas)) {
        lastQuotaFetchTimeRef.current = Date.now();
        setCategories(prev => {
          const quotaMap = new Map(quotas.map(q => [q.id, q]));
          const updated = prev.map(cat => {
            const fresh = quotaMap.get(cat.id);
            if (fresh) {
              return {
                ...cat,
                maxTeams: fresh.maxTeams,
                registeredTeamsCount: fresh.registeredTeamsCount,
              };
            }
            return cat;
          });
          safeLocalStorageSet('wabupcup_categories', JSON.stringify(updated));
          return updated;
        });
        return quotas;
      }
    } catch (err) {
      console.warn('Failed to refresh category quotas:', err);
    }
    return null;
  }, []);

  const syncCategoryQuotas = async () => {
    try {
      const ok = await ApiService.syncCategoryCounts();
      if (!ok) throw new Error('Gagal melakukan sinkronisasi kuota');
      await refreshCategoryQuotas(true);
    } catch (err) {
      console.error('Failed to sync category quotas', err);
      throw err;
    }
  };

  // Registrations state
  const [registrations, setRegistrations] = useState<RegistrationItem[]>(() => {
    const cached = safeLocalStorageGet<RegistrationItem[]>('wabupcup_registrations', []);
    return filterOutMockRegistrations(cached);
  });

  // Load from IndexedDB on mount to recover full file data (PDF Base64)
  useEffect(() => {
    let isMounted = true;
    idbGetRegistrations().then(idbRegs => {
      const realIdbRegs = filterOutMockRegistrations(idbRegs || []);
      if (isMounted && realIdbRegs.length > 0) {
        setRegistrations(prev => {
          const map = new Map<string, RegistrationItem>();
          for (const item of realIdbRegs) {
            map.set(item.id, item);
          }
          for (const item of prev) {
            const existing = map.get(item.id);
            if (existing && existing.documents && Object.keys(existing.documents).length > 0) {
              map.set(item.id, {
                ...item,
                documents: existing.documents,
                teamLogo: item.teamLogo || existing.teamLogo,
              });
            } else {
              map.set(item.id, item);
            }
          }
          return Array.from(map.values());
        });
      }
    }).catch(err => {
      console.warn('[IDB] Initial load warning:', err);
    });
    return () => { isMounted = false; };
  }, []);

  // Save registrations to localStorage (sanitized) and IndexedDB (full)
  useEffect(() => {
    // 1. Save full copy to IndexedDB (asynchronous, supports huge files)
    idbSaveRegistrations(registrations).catch(() => {});

    // 2. Save lightweight sanitized version to localStorage without throwing QuotaExceededError
    const sanitized = sanitizeRegistrationsForLocalStorage(registrations);
    safeLocalStorageSet('wabupcup_registrations', JSON.stringify(sanitized));
  }, [registrations]);

  /**
   * Sanitizes registration payload before sending over the wire to prevent
   * Vercel serverless FUNCTION_PAYLOAD_TOO_LARGE (4.5MB limit) or database packet errors.
   * Full document binaries are already preserved permanently in IndexedDB.
   */
  const prepareRegistrationForApi = (item: RegistrationItem): RegistrationItem => {
    if (!item.documents) return item;

    const sanitizedDocs: any = {};
    for (const [key, doc] of Object.entries(item.documents)) {
      if (!doc) continue;
      const d = doc as any;
      // Eliminate duplicate base64 across fileData and previewUrl
      const fileContent = d.fileData || d.previewUrl;
      const fileUrl = d.url || (typeof fileContent === 'string' && fileContent.includes('/api/media/view/') ? fileContent : undefined);
      sanitizedDocs[key] = {
        name: d.name,
        size: d.size,
        uploadDate: d.uploadDate,
        type: d.type,
        url: fileUrl,
        fileData: fileContent,
      };
    }

    let candidate: RegistrationItem = {
      ...item,
      documents: sanitizedDocs,
    };

    // Calculate approximate payload size
    try {
      const jsonStr = JSON.stringify(candidate);
      // Vercel limit is 4.5MB; keep payload strictly under 3MB
      if (jsonStr.length > 3 * 1024 * 1024) {
        const reducedDocs: any = {};
        for (const [key, doc] of Object.entries(candidate.documents || {})) {
          if (!doc) continue;
          const d = doc as any;
          // Keep receipt and logo if possible; keep metadata for large PDFs
          if (key === 'buktiPembayaran' || key === 'logoTim') {
            reducedDocs[key] = d;
          } else {
            reducedDocs[key] = {
              name: d.name,
              size: d.size,
              uploadDate: d.uploadDate,
              type: d.type,
              url: d.url || (typeof d.fileData === 'string' && d.fileData.includes('/api/media/view/') ? d.fileData : undefined),
            };
          }
        }
        candidate = {
          ...candidate,
          documents: reducedDocs,
        };
      }
    } catch {
      // Fallback
    }

    return candidate;
  };

  const submitNewRegistration = async (
    data: Omit<RegistrationItem, 'id' | 'regCode' | 'registrationDate' | 'status' | 'paymentStatus' | 'lastUpdated'> & { id?: string }
  ): Promise<RegistrationItem> => {
    const now = new Date();
    const formattedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    
    // Generate strictly unique sequential code checking all known registrations
    const regCode = generateUniqueRegCode(data.category, registrations);
    const generatedId = (data as any).id || `reg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    
    let currentReg: RegistrationItem = {
      ...data,
      id: generatedId,
      regCode,
      registrationDate: formattedDate,
      status: 'PENDING_PAYMENT',
      paymentStatus: 'UNPAID',
      lastUpdated: formattedDate,
    };

    // Optimistically register in state and IndexedDB
    setRegistrations(prev => [currentReg, ...prev.filter(r => r.id !== currentReg.id)]);
    idbSaveRegistration(currentReg).catch(() => {});

    // Optimistically update category count
    setCategories(prev => prev.map(c =>
      c.id === data.category
        ? { ...c, registeredTeamsCount: (c.registeredTeamsCount || 0) + 1 }
        : c
    ));

    // Send payload safely to backend API and await server response
    try {
      const apiPayload = prepareRegistrationForApi(currentReg);
      const serverSaved = await ApiService.createRegistration(apiPayload);
      if (serverSaved && serverSaved.id) {
        currentReg = {
          ...currentReg,
          ...serverSaved,
          // Preserve local documents if server payload trimmed binaries
          documents: currentReg.documents || serverSaved.documents,
        };
        // Reconcile state and storage with server-confirmed registration
        setRegistrations(prev => [currentReg, ...prev.filter(r => r.id !== currentReg.id && r.id !== generatedId)]);
        idbSaveRegistration(currentReg).catch(() => {});
        return currentReg;
      }
    } catch (err) {
      console.error('Registration failed, rolling back optimistic updates:', err);
      // Revert optimistic updates
      setRegistrations(prev => prev.filter(r => r.id !== currentReg.id));
      idbDeleteRegistration(currentReg.id).catch(() => {});
      setCategories(prev => prev.map(c =>
        c.id === data.category
          ? { ...c, registeredTeamsCount: Math.max(0, (c.registeredTeamsCount || 0) - 1) }
          : c
      ));
      throw err; // Propagate the error so the UI can catch it (409, 503)
    }

    return currentReg;
  };

  const updateRegistration = (updatedItem: RegistrationItem) => {
    const now = new Date();
    const formattedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const fullUpdated = { ...updatedItem, lastUpdated: formattedDate };
    
    // Check for replaced or removed media files to clean up from storage
    const oldItem = registrations.find(r => r.id === updatedItem.id || r.regCode === updatedItem.id);
    if (oldItem) {
      const newMediaUrls = new Set<string>();
      const oldMediaUrls: string[] = [];

      const extractUrls = (target: any, setOrList: Set<string> | string[], isOld = false) => {
        if (!target) return;
        const addUrl = (u: string) => {
          if (typeof u === 'string' && u.includes('/api/media/view/')) {
            if (isOld) {
              if (!newMediaUrls.has(u)) (setOrList as string[]).push(u);
            } else {
              (setOrList as Set<string>).add(u);
            }
          }
        };

        if (typeof target === 'string') {
          addUrl(target);
        } else if (typeof target === 'object') {
          if (target.url) addUrl(target.url);
          if (target.fileData) addUrl(target.fileData);
        }
      };

      // 1. Gather all URLs in updated registration
      extractUrls(fullUpdated.teamLogo, newMediaUrls);
      if (fullUpdated.documents) {
        Object.values(fullUpdated.documents).forEach(doc => extractUrls(doc, newMediaUrls));
      }

      // 2. Identify any URLs from previous registration that are no longer present
      extractUrls(oldItem.teamLogo, oldMediaUrls, true);
      if (oldItem.documents) {
        Object.values(oldItem.documents).forEach(doc => extractUrls(doc, oldMediaUrls, true));
      }

      // 3. Immediately purge replaced/removed files from TiDB Cloud media storage
      for (const u of oldMediaUrls) {
        deleteMediaFromStorage(u).catch(err =>
          console.warn('[updateRegistration] Could not delete replaced media:', err)
        );
      }
    }

    setRegistrations(prev =>
      prev.map(item => (item.id === updatedItem.id ? fullUpdated : item))
    );

    // Cascade update to groups and matches state when team logo or name is edited
    if (fullUpdated.teamLogo || fullUpdated.teamName) {
      const normName = fullUpdated.teamName.trim().toLowerCase();
      const normInst = (fullUpdated.institutionName || '').trim().toLowerCase();

      setGroups(prev => {
        const next = prev.map(g => ({
          ...g,
          teams: Array.isArray(g.teams)
            ? g.teams.map(t =>
                t.name?.trim().toLowerCase() === normName ||
                (normInst && t.institution?.trim().toLowerCase() === normInst)
                  ? { ...t, logo: fullUpdated.teamLogo || t.logo, institution: fullUpdated.institutionName || t.institution }
                  : t
              )
            : g.teams,
        }));
        safeLocalStorageSet('wabupcup_groups', JSON.stringify(next));
        return next;
      });

      setMatches(prev => {
        const next = prev.map(m => {
          let changed = false;
          let newA = { ...m.teamA };
          let newB = { ...m.teamB };
          if (m.teamA?.name?.trim().toLowerCase() === normName || (normInst && m.teamA?.institution?.trim().toLowerCase() === normInst)) {
            newA.logo = fullUpdated.teamLogo || newA.logo;
            newA.institution = fullUpdated.institutionName || newA.institution;
            changed = true;
          }
          if (m.teamB?.name?.trim().toLowerCase() === normName || (normInst && m.teamB?.institution?.trim().toLowerCase() === normInst)) {
            newB.logo = fullUpdated.teamLogo || newB.logo;
            newB.institution = fullUpdated.institutionName || newB.institution;
            changed = true;
          }
          return changed ? { ...m, teamA: newA, teamB: newB } : m;
        });
        safeLocalStorageSet('wabupcup_matches', JSON.stringify(next));
        return next;
      });
    }

    idbSaveRegistration(fullUpdated).catch(() => {});

    const apiPayload = prepareRegistrationForApi(fullUpdated);
    ApiService.updateRegistration(apiPayload).catch(err =>
      console.warn('Could not sync registration update to backend:', err)
    );
  };

  const updateRegistrationStatus = (
    id: string,
    status: RegistrationStatus,
    reason?: string,
    notes?: string
  ) => {
    const now = new Date();
    const formattedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    
    setRegistrations(prev =>
      prev.map(item => {
        if (item.id === id) {
          const updated: RegistrationItem = {
            ...item,
            status,
            rejectionReason: reason !== undefined ? reason : item.rejectionReason,
            adminNotes: notes !== undefined ? notes : item.adminNotes,
            lastUpdated: formattedDate,
          };
          idbSaveRegistration(updated).catch(() => {});
          return updated;
        }
        return item;
      })
    );

    ApiService.updateRegistrationStatus(id, status, reason, notes).catch(err =>
      console.warn('Could not sync status update to backend:', err)
    );
  };

  const updatePaymentStatus = (id: string, paymentStatus: PaymentStatus) => {
    const now = new Date();
    const formattedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    
    setRegistrations(prev =>
      prev.map(item => {
        if (item.id === id) {
          const newStatus: RegistrationStatus =
            paymentStatus === 'PAID' && item.status === 'PENDING_PAYMENT'
              ? 'APPROVED'
              : item.status;
          const updated: RegistrationItem = {
            ...item,
            paymentStatus,
            status: newStatus,
            lastUpdated: formattedDate,
          };
          idbSaveRegistration(updated).catch(() => {});
          return updated;
        }
        return item;
      })
    );

    ApiService.updatePaymentStatus(id, paymentStatus).catch(err =>
      console.warn('Could not sync payment update to backend:', err)
    );
  };

  const deleteRegistration = (id: string) => {
    const target = registrations.find(r => r.id === id || r.regCode === id);

    // Filter out registration from state
    setRegistrations(prev => prev.filter(item => item.id !== id && item.regCode !== id));
    idbDeleteRegistration(id).catch(() => {});
    if (target?.id && target.id !== id) {
      idbDeleteRegistration(target.id).catch(() => {});
    }

    // Defensive client cleanup: remove any connected files from TiDB media storage directly
    if (target) {
      const mediaUrls: string[] = [];
      if (target.teamLogo && target.teamLogo.includes('/api/media/view/')) {
        mediaUrls.push(target.teamLogo);
      }
      if (target.documents && typeof target.documents === 'object') {
        for (const doc of Object.values(target.documents)) {
          if (!doc) continue;
          const d = doc as any;
          if (d.url && typeof d.url === 'string' && d.url.includes('/api/media/view/')) {
            mediaUrls.push(d.url);
          }
          if (d.fileData && typeof d.fileData === 'string' && d.fileData.includes('/api/media/view/')) {
            mediaUrls.push(d.fileData);
          }
        }
      }
      for (const u of mediaUrls) {
        deleteMediaFromStorage(u).catch(() => {});
      }
    }

    // Primary server deletion: triggers cascading delete on MySQL/TiDB registrations AND app_media_storage
    ApiService.deleteRegistration(id).catch(err =>
      console.warn('Could not delete registration on backend:', err)
    );
  };

  // Matches & Schedule
  const [matches, setMatches] = useState<MatchItem[]>(() => {
    const cached = safeLocalStorageGet<MatchItem[]>('wabupcup_matches', []);
    return filterOutMockMatches(cached);
  });

  useEffect(() => {
    safeLocalStorageSet('wabupcup_matches', JSON.stringify(matches));
  }, [matches]);

  // Auto-transition matches from UPCOMING to LIVE and advance the live minute automatically
  // Stops if match is FINISHED by admin
  useEffect(() => {
    const evaluateLiveMatches = () => {
      const now = new Date();

      setMatches(prevMatches => {
        let changed = false;
        const updated = prevMatches.map(m => {
          // If already FINISHED, do not modify status automatically
          if (m.status === 'FINISHED') {
            return m;
          }

          if (!m.date || !m.time) return m;

          try {
            const dateParts = m.date.split('-').map(Number);
            const timeParts = m.time.split(':').map(Number);
            if (dateParts.length < 3 || timeParts.length < 2) return m;

            const [year, month, day] = dateParts;
            const [hours, minutes] = timeParts;

            if (isNaN(year) || isNaN(month) || isNaN(day) || isNaN(hours) || isNaN(minutes)) {
              return m;
            }

            const matchStartTime = new Date(year, month - 1, day, hours, minutes, 0, 0).getTime();
            const nowTime = now.getTime();
            const diffMs = nowTime - matchStartTime;
            const diffMinutes = Math.floor(diffMs / (60 * 1000));

            // If match time has arrived (0 to 120 minutes from kickoff)
            if (diffMinutes >= 0 && diffMinutes <= 120) {
              let minuteStr = '';
              if (diffMinutes < 45) {
                minuteStr = `${Math.max(1, diffMinutes + 1)}'`;
              } else if (diffMinutes >= 45 && diffMinutes < 60) {
                minuteStr = `HT (45+')`;
              } else if (diffMinutes >= 60 && diffMinutes < 105) {
                minuteStr = `${diffMinutes - 15}'`;
              } else {
                minuteStr = `90+'`;
              }

              if (m.status !== 'LIVE' || m.liveMinute !== minuteStr) {
                changed = true;
                return {
                  ...m,
                  status: 'LIVE' as const,
                  liveMinute: minuteStr,
                };
              }
            } else if (diffMinutes < 0) {
              // Match is in the future
              if (m.status === 'LIVE') {
                changed = true;
                return {
                  ...m,
                  status: 'UPCOMING' as const,
                  liveMinute: undefined,
                };
              }
            }
          } catch {
            // Ignore date calculation errors
          }

          return m;
        });

        return changed ? updated : prevMatches;
      });
    };

    evaluateLiveMatches();
    const timer = setInterval(evaluateLiveMatches, 5000);
    return () => clearInterval(timer);
  }, []);

  const addMatch = (newMatch: Omit<MatchItem, 'id'>) => {
    const item: MatchItem = {
      ...newMatch,
      id: `match-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    };
    setMatches(prev => {
      const next = [item, ...prev];
      safeLocalStorageSet('wabupcup_matches', JSON.stringify(next));
      return next;
    });
    ApiService.saveMatch(item).catch(err =>
      console.warn('Could not save match to backend:', err)
    );
  };

  const updateMatch = (updated: MatchItem) => {
    // 1. Calculate Winner ID automatically based on regular scores and penalties
    let determinedWinner: 'A' | 'B' | 'DRAW' | undefined = updated.winnerId;

    const scoreA = updated.teamA.score;
    const scoreB = updated.teamB.score;
    const penA = updated.teamA.penalties;
    const penB = updated.teamB.penalties;

    if (scoreA !== undefined && scoreB !== undefined) {
      if (scoreA > scoreB) {
        determinedWinner = 'A';
      } else if (scoreB > scoreA) {
        determinedWinner = 'B';
      } else {
        // Tied / Draw score: check penalties shootout
        if (penA !== undefined && penB !== undefined && penA !== penB) {
          determinedWinner = penA > penB ? 'A' : 'B';
        } else {
          determinedWinner = 'DRAW';
        }
      }
    }

    const matchWithWinner: MatchItem = {
      ...updated,
      winnerId: determinedWinner,
    };

    setMatches(prevMatches => {
      // Create new copy with updated match
      let newMatchesList = prevMatches.map(m => (m.id === updated.id ? matchWithWinner : m));

      // 2. AUTOMATIC ADVANCEMENT TO NEXT ROUND IF FINISHED
      if (matchWithWinner.status === 'FINISHED' && (determinedWinner === 'A' || determinedWinner === 'B')) {
        const winningTeam = determinedWinner === 'A' ? matchWithWinner.teamA : matchWithWinner.teamB;

        // If explicit nextMatchId is set
        if (matchWithWinner.nextMatchId) {
          newMatchesList = newMatchesList.map(m => {
            if (m.id === matchWithWinner.nextMatchId) {
              const updatedNextMatch = matchWithWinner.nextMatchSlot === 'B'
                ? {
                    ...m,
                    teamB: {
                      ...m.teamB,
                      name: winningTeam.name,
                      institution: winningTeam.institution,
                      logo: winningTeam.logo,
                    },
                  }
                : {
                    ...m,
                    teamA: {
                      ...m.teamA,
                      name: winningTeam.name,
                      institution: winningTeam.institution,
                      logo: winningTeam.logo,
                    },
                  };
              ApiService.saveMatch(updatedNextMatch).catch(() => {});
              return updatedNextMatch;
            }
            return m;
          });
        }
      } else if (matchWithWinner.status !== 'FINISHED' && matchWithWinner.nextMatchId) {
        // If reverted from FINISHED, clear slot in next match
        const placeholderName = `Pemenang Match ${matchWithWinner.matchNumber}`;
        newMatchesList = newMatchesList.map(m => {
          if (m.id === matchWithWinner.nextMatchId) {
            const updatedNextMatch = matchWithWinner.nextMatchSlot === 'B'
              ? {
                  ...m,
                  teamB: {
                    ...m.teamB,
                    name: placeholderName,
                    institution: 'TBD',
                    logo: undefined,
                    score: undefined,
                    penalties: undefined,
                  },
                }
              : {
                  ...m,
                  teamA: {
                    ...m.teamA,
                    name: placeholderName,
                    institution: 'TBD',
                    logo: undefined,
                    score: undefined,
                    penalties: undefined,
                  },
                };
            ApiService.saveMatch(updatedNextMatch).catch(() => {});
            return updatedNextMatch;
          }
          return m;
        });
      }

      const updatedStandings = computeStandingsFromData(newMatchesList, groups, registrations);
      setStandings(updatedStandings);
      safeLocalStorageSet('wabupcup_standings', JSON.stringify(updatedStandings));
      safeLocalStorageSet('wabupcup_matches', JSON.stringify(newMatchesList));

      return newMatchesList;
    });

    ApiService.saveMatch(matchWithWinner).catch(err =>
      console.warn('Could not sync match update to backend:', err)
    );
  };

  const deleteMatch = (matchId: string) => {
    setMatches(prev => {
      const updated = prev.filter(m => m.id !== matchId);
      safeLocalStorageSet('wabupcup_matches', JSON.stringify(updated));
      const nextStandings = computeStandingsFromData(updated, groups, registrations);
      setStandings(nextStandings);
      safeLocalStorageSet('wabupcup_standings', JSON.stringify(nextStandings));
      return updated;
    });
    ApiService.deleteMatch(matchId).catch(err =>
      console.warn('Could not delete match on backend:', err)
    );
  };

  // CHECK IF NEXT ROUND CAN BE DRAWN (Must wait until previous round matches are ALL FINISHED)
  const checkCanDrawNextRound = (category: TournamentCategory) => {
    const catMatches = matches.filter(m => m.category === category);
    if (catMatches.length === 0) {
      return {
        canDraw: true,
        pendingMatchesCount: 0,
        completedMatchesCount: 0,
        totalMatchesCount: 0,
        currentRoundName: 'Belum Ada Pertandingan',
      };
    }

    // Find the earliest incomplete round
    const pendingMatches = catMatches.filter(m => m.status !== 'FINISHED');
    const completedMatches = catMatches.filter(m => m.status === 'FINISHED');

    return {
      canDraw: pendingMatches.length === 0,
      pendingMatchesCount: pendingMatches.length,
      completedMatchesCount: completedMatches.length,
      totalMatchesCount: catMatches.length,
      currentRoundName: pendingMatches[0]?.round || 'Seluruh Babak Selesai',
    };
  };

  // ADVANCED DRAWING & BRACKET GENERATOR (Sistem Acak Berjenjang Sinkron Tim Approved)
  const randomizeMatchesForCategory = (
    category: TournamentCategory,
    stageOption?: 'AUTO' | 'PENYISIHAN' | '16_BESAR' | '8_BESAR' | 'SEMIFINAL'
  ): { success: boolean; message: string; matches?: MatchItem[] } => {
    // 1. Get ONLY APPROVED registered teams for this specific category
    const approvedTeams = registrations
      .filter(r => r.category === category && r.status === 'APPROVED')
      .map(r => ({
        name: r.teamName,
        institution: r.institutionName,
        logo: r.teamLogo,
      }));

    if (approvedTeams.length === 0) {
      return {
        success: false,
        message: `Kategori "${category}" belum memiliki tim pendaftar yang berstatus APPROVED (Disetujui). Silakan verifikasi dan setujui tim terdaftar terlebih dahulu di menu Pendaftaran sebelum melakukan pengacakan bagan.`,
      };
    }

    if (approvedTeams.length < 2) {
      return {
        success: false,
        message: `Kategori "${category}" baru memiliki ${approvedTeams.length} tim yang disetujui (Approved). Minimal diperlukan 2 tim untuk melakukan pengacakan jadwal dan bagan pertandingan.`,
      };
    }

    // 2. Fisher-Yates Random Shuffle strictly on real approved teams
    const teamsToDraw = [...approvedTeams];
    for (let i = teamsToDraw.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [teamsToDraw[i], teamsToDraw[j]] = [teamsToDraw[j], teamsToDraw[i]];
    }

    // Determine tournament bracket structure
    let chosenStructure: '16_BESAR' | '8_BESAR' | 'SEMIFINAL' | 'FINAL_ONLY' = '8_BESAR';

    if (stageOption === '16_BESAR' || stageOption === 'PENYISIHAN') {
      chosenStructure = '16_BESAR';
    } else if (stageOption === '8_BESAR') {
      chosenStructure = '8_BESAR';
    } else if (stageOption === 'SEMIFINAL') {
      chosenStructure = 'SEMIFINAL';
    } else {
      // AUTO based on approved teams count
      if (teamsToDraw.length >= 9) {
        chosenStructure = '16_BESAR';
      } else if (teamsToDraw.length >= 5) {
        chosenStructure = '8_BESAR';
      } else if (teamsToDraw.length >= 3) {
        chosenStructure = 'SEMIFINAL';
      } else {
        chosenStructure = 'FINAL_ONLY';
      }
    }

    const kickoffTimes = ['08:00', '09:15', '10:30', '13:30', '15:00', '16:15', '19:00', '20:15'];
    const defaultVenue = config.venueName || 'Gedung Utama GOR Tawang Alun Banyuwangi';
    const pitches = [
      defaultVenue,
      `${defaultVenue} - Lapangan A`,
      `${defaultVenue} - Lapangan B`
    ];
    let matchCounter = 1;
    const newGeneratedMatches: MatchItem[] = [];

    // Grand Final Match ID & Semifinal IDs
    const grandFinalId = `match-${category.toLowerCase()}-final-${Date.now()}`;
    const semi1Id = `match-${category.toLowerCase()}-sf1-${Date.now()}`;
    const semi2Id = `match-${category.toLowerCase()}-sf2-${Date.now()}`;

    // Quarter Finals IDs
    const qfIds = [
      `match-${category.toLowerCase()}-qf1-${Date.now()}`,
      `match-${category.toLowerCase()}-qf2-${Date.now()}`,
      `match-${category.toLowerCase()}-qf3-${Date.now()}`,
      `match-${category.toLowerCase()}-qf4-${Date.now()}`,
    ];

    // Babak 16 Besar IDs
    const r16Ids = [
      `match-${category.toLowerCase()}-r16-1-${Date.now()}`,
      `match-${category.toLowerCase()}-r16-2-${Date.now()}`,
      `match-${category.toLowerCase()}-r16-3-${Date.now()}`,
      `match-${category.toLowerCase()}-r16-4-${Date.now()}`,
      `match-${category.toLowerCase()}-r16-5-${Date.now()}`,
      `match-${category.toLowerCase()}-r16-6-${Date.now()}`,
      `match-${category.toLowerCase()}-r16-7-${Date.now()}`,
      `match-${category.toLowerCase()}-r16-8-${Date.now()}`,
    ];

    if (chosenStructure === 'FINAL_ONLY') {
      const teamA = teamsToDraw[0];
      const teamB = teamsToDraw[1];
      newGeneratedMatches.push({
        id: grandFinalId,
        matchNumber: matchCounter++,
        category: category,
        round: 'GRAND FINAL WABUP CUP 2026',
        roundIndex: 5,
        teamA: { name: teamA.name, institution: teamA.institution, logo: teamA.logo },
        teamB: { name: teamB.name, institution: teamB.institution, logo: teamB.logo },
        date: '2026-10-31',
        time: '19:00',
        pitch: defaultVenue,
        status: 'UPCOMING',
      });
    } else if (chosenStructure === '16_BESAR') {
      // Pad missing slots with BYE
      const targetTeams = [...teamsToDraw];
      while (targetTeams.length < 16) {
        targetTeams.push({ name: 'BYE (Lolos Otomatis)', institution: '-' });
      }

      // 1. 8 MATCHES IN BABAK 16 BESAR (Penyisihan 1-8)
      for (let i = 0; i < 8; i++) {
        const teamA = targetTeams[i * 2];
        const teamB = targetTeams[i * 2 + 1];
        const assignedQfId = qfIds[Math.floor(i / 2)];
        const assignedQfSlot: 'A' | 'B' = i % 2 === 0 ? 'A' : 'B';

        newGeneratedMatches.push({
          id: r16Ids[i],
          matchNumber: matchCounter++,
          category: category,
          round: `Babak 16 Besar - Match ${i + 1}`,
          roundIndex: 2,
          teamA: {
            name: teamA.name,
            institution: teamA.institution,
            logo: teamA.logo,
          },
          teamB: {
            name: teamB.name,
            institution: teamB.institution,
            logo: teamB.logo,
          },
          date: '2026-10-25',
          time: kickoffTimes[i % kickoffTimes.length],
          pitch: pitches[i % pitches.length],
          status: 'UPCOMING',
          nextMatchId: assignedQfId,
          nextMatchSlot: assignedQfSlot,
        });
      }

      // 2. 4 QUARTER FINAL MATCHES (Perempat Final 1-4)
      for (let i = 0; i < 4; i++) {
        const assignedNextId = i < 2 ? semi1Id : semi2Id;
        const assignedNextSlot: 'A' | 'B' = i % 2 === 0 ? 'A' : 'B';

        newGeneratedMatches.push({
          id: qfIds[i],
          matchNumber: matchCounter++,
          category: category,
          round: `Perempat Final ${i + 1} (8 Besar)`,
          roundIndex: 3,
          teamA: { name: `Pemenang Match ${i * 2 + 1}`, institution: 'TBD' },
          teamB: { name: `Pemenang Match ${i * 2 + 2}`, institution: 'TBD' },
          date: '2026-10-27',
          time: kickoffTimes[i % kickoffTimes.length],
          pitch: pitches[i % pitches.length],
          status: 'UPCOMING',
          nextMatchId: assignedNextId,
          nextMatchSlot: assignedNextSlot,
        });
      }

      // 3. 2 SEMIFINALS
      newGeneratedMatches.push({
        id: semi1Id,
        matchNumber: matchCounter++,
        category: category,
        round: 'Semifinal 1',
        roundIndex: 4,
        teamA: { name: 'Pemenang Perempat Final 1', institution: 'TBD' },
        teamB: { name: 'Pemenang Perempat Final 2', institution: 'TBD' },
        date: '2026-10-29',
        time: '16:00',
        pitch: defaultVenue,
        status: 'UPCOMING',
        nextMatchId: grandFinalId,
        nextMatchSlot: 'A',
      });

      newGeneratedMatches.push({
        id: semi2Id,
        matchNumber: matchCounter++,
        category: category,
        round: 'Semifinal 2',
        roundIndex: 4,
        teamA: { name: 'Pemenang Perempat Final 3', institution: 'TBD' },
        teamB: { name: 'Pemenang Perempat Final 4', institution: 'TBD' },
        date: '2026-10-29',
        time: '19:30',
        pitch: defaultVenue,
        status: 'UPCOMING',
        nextMatchId: grandFinalId,
        nextMatchSlot: 'B',
      });

      // 4. GRAND FINAL
      newGeneratedMatches.push({
        id: grandFinalId,
        matchNumber: matchCounter++,
        category: category,
        round: 'GRAND FINAL WABUP CUP 2026',
        roundIndex: 5,
        teamA: { name: 'Pemenang Semifinal 1', institution: 'TBD' },
        teamB: { name: 'Pemenang Semifinal 2', institution: 'TBD' },
        date: '2026-10-31',
        time: '19:00',
        pitch: defaultVenue,
        status: 'UPCOMING',
      });
    } else if (chosenStructure === '8_BESAR') {
      // Pad missing slots with BYE
      const targetTeams = [...teamsToDraw];
      while (targetTeams.length < 8) {
        targetTeams.push({ name: 'BYE (Lolos Otomatis)', institution: '-' });
      }

      // 4 QUARTER FINAL MATCHES (Babak 8 Besar)
      for (let i = 0; i < 4; i++) {
        const teamA = targetTeams[i * 2];
        const teamB = targetTeams[i * 2 + 1];
        const assignedNextId = i < 2 ? semi1Id : semi2Id;
        const assignedNextSlot: 'A' | 'B' = i % 2 === 0 ? 'A' : 'B';

        newGeneratedMatches.push({
          id: qfIds[i],
          matchNumber: matchCounter++,
          category: category,
          round: `Perempat Final ${i + 1} (8 Besar)`,
          roundIndex: 3,
          teamA: {
            name: teamA.name,
            institution: teamA.institution,
            logo: teamA.logo,
          },
          teamB: {
            name: teamB.name,
            institution: teamB.institution,
            logo: teamB.logo,
          },
          date: '2026-10-26',
          time: kickoffTimes[i % kickoffTimes.length],
          pitch: pitches[i % pitches.length],
          status: 'UPCOMING',
          nextMatchId: assignedNextId,
          nextMatchSlot: assignedNextSlot,
        });
      }

      // 2 SEMIFINAL MATCHES
      newGeneratedMatches.push({
        id: semi1Id,
        matchNumber: matchCounter++,
        category: category,
        round: 'Semifinal 1',
        roundIndex: 4,
        teamA: { name: 'Pemenang Perempat Final 1', institution: 'TBD' },
        teamB: { name: 'Pemenang Perempat Final 2', institution: 'TBD' },
        date: '2026-10-28',
        time: '16:00',
        pitch: defaultVenue,
        status: 'UPCOMING',
        nextMatchId: grandFinalId,
        nextMatchSlot: 'A',
      });

      newGeneratedMatches.push({
        id: semi2Id,
        matchNumber: matchCounter++,
        category: category,
        round: 'Semifinal 2',
        roundIndex: 4,
        teamA: { name: 'Pemenang Perempat Final 3', institution: 'TBD' },
        teamB: { name: 'Pemenang Perempat Final 4', institution: 'TBD' },
        date: '2026-10-28',
        time: '19:30',
        pitch: defaultVenue,
        status: 'UPCOMING',
        nextMatchId: grandFinalId,
        nextMatchSlot: 'B',
      });

      // GRAND FINAL MATCH
      newGeneratedMatches.push({
        id: grandFinalId,
        matchNumber: matchCounter++,
        category: category,
        round: 'GRAND FINAL WABUP CUP 2026',
        roundIndex: 5,
        teamA: { name: 'Pemenang Semifinal 1', institution: 'TBD' },
        teamB: { name: 'Pemenang Semifinal 2', institution: 'TBD' },
        date: '2026-10-31',
        time: '19:00',
        pitch: defaultVenue,
        status: 'UPCOMING',
      });
    } else {
      // SEMIFINALS (3-4 Teams)
      const targetTeams = [...teamsToDraw];
      while (targetTeams.length < 4) {
        targetTeams.push({ name: 'BYE (Lolos Otomatis)', institution: '-' });
      }

      const teamA1 = targetTeams[0];
      const teamB1 = targetTeams[1];
      const teamA2 = targetTeams[2];
      const teamB2 = targetTeams[3];

      newGeneratedMatches.push({
        id: semi1Id,
        matchNumber: matchCounter++,
        category: category,
        round: 'Semifinal 1',
        roundIndex: 4,
        teamA: { name: teamA1.name, institution: teamA1.institution, logo: teamA1.logo },
        teamB: { name: teamB1.name, institution: teamB1.institution, logo: teamB1.logo },
        date: '2026-10-28',
        time: '16:00',
        pitch: defaultVenue,
        status: 'UPCOMING',
        nextMatchId: grandFinalId,
        nextMatchSlot: 'A',
      });

      newGeneratedMatches.push({
        id: semi2Id,
        matchNumber: matchCounter++,
        category: category,
        round: 'Semifinal 2',
        roundIndex: 4,
        teamA: { name: teamA2.name, institution: teamA2.institution, logo: teamA2.logo },
        teamB: { name: teamB2.name, institution: teamB2.institution, logo: teamB2.logo },
        date: '2026-10-28',
        time: '19:30',
        pitch: defaultVenue,
        status: 'UPCOMING',
        nextMatchId: grandFinalId,
        nextMatchSlot: 'B',
      });

      newGeneratedMatches.push({
        id: grandFinalId,
        matchNumber: matchCounter++,
        category: category,
        round: 'GRAND FINAL WABUP CUP 2026',
        roundIndex: 5,
        teamA: { name: 'Pemenang Semifinal 1', institution: 'TBD' },
        teamB: { name: 'Pemenang Semifinal 2', institution: 'TBD' },
        date: '2026-10-31',
        time: '19:00',
        pitch: defaultVenue,
        status: 'UPCOMING',
      });
    }

    // Replace matches for this category in local state and localStorage
    setMatches(prev => {
      const otherCategoryMatches = prev.filter(m => m.category !== category);
      const combined = [...otherCategoryMatches, ...newGeneratedMatches];
      safeLocalStorageSet('wabupcup_matches', JSON.stringify(combined));
      return combined;
    });

    // Sync and persist immediately to backend server & MySQL database
    ApiService.replaceCategoryMatches(category, newGeneratedMatches).catch(err => {
      console.warn('Could not sync randomized matches to backend:', err);
    });

    return {
      success: true,
      message: `Bagan sistem gugur resmi kategori ${category} berhasil diacak (${approvedTeams.length} Tim Disetujui).`,
      matches: newGeneratedMatches,
    };
  };

  // Groups State
  const [groups, setGroups] = useState<GroupStageItem[]>(() => {
    return safeLocalStorageGet<GroupStageItem[]>('wabupcup_groups', []);
  });

  useEffect(() => {
    safeLocalStorageSet('wabupcup_groups', JSON.stringify(groups));
  }, [groups]);

  // Players State
  const [players, setPlayers] = useState<PlayerItem[]>(() => {
    return safeLocalStorageGet<PlayerItem[]>('wabupcup_players', []);
  });

  useEffect(() => {
    safeLocalStorageSet('wabupcup_players', JSON.stringify(players));
  }, [players]);

  // Standings State (calculated dynamically and synced)
  const [standings, setStandings] = useState<Record<string, TeamStandingItem[]>>(() => {
    const cachedMatches = safeLocalStorageGet<MatchItem[]>('wabupcup_matches', []);
    const cachedGroups = safeLocalStorageGet<GroupStageItem[]>('wabupcup_groups', []);
    const cachedRegs = safeLocalStorageGet<RegistrationItem[]>('wabupcup_registrations', []);
    return computeStandingsFromData(cachedMatches, cachedGroups, cachedRegs);
  });

  useEffect(() => {
    const computed = computeStandingsFromData(matches, groups, registrations);
    setStandings(computed);
    safeLocalStorageSet('wabupcup_standings', JSON.stringify(computed));
  }, [matches, groups, registrations]);

  const refreshStandings = async () => {
    try {
      const serverStandings = await ApiService.getStandings();
      if (serverStandings && Object.keys(serverStandings).length > 0) {
        setStandings(serverStandings);
        safeLocalStorageSet('wabupcup_standings', JSON.stringify(serverStandings));
      } else {
        const computed = computeStandingsFromData(matches, groups, registrations);
        setStandings(computed);
        safeLocalStorageSet('wabupcup_standings', JSON.stringify(computed));
      }
    } catch {
      const computed = computeStandingsFromData(matches, groups, registrations);
      setStandings(computed);
      safeLocalStorageSet('wabupcup_standings', JSON.stringify(computed));
    }
  };

  const saveGroupStagesForCategory = async (category: TournamentCategory, newGroups: GroupStageItem[]) => {
    setGroups(prev => {
      const filtered = prev.filter(g => g.category !== category);
      const combined = [...filtered, ...newGroups];
      safeLocalStorageSet('wabupcup_groups', JSON.stringify(combined));
      return combined;
    });
    ApiService.saveGroups(category, newGroups).catch(console.warn);
  };

  const addGroup = (category: TournamentCategory, groupName: string) => {
    const newGroup: GroupStageItem = {
      id: `grp-${category.toLowerCase()}-${Date.now()}`,
      category,
      groupName,
      teams: [],
    };
    setGroups(prev => {
      const combined = [...prev, newGroup];
      safeLocalStorageSet('wabupcup_groups', JSON.stringify(combined));
      const catGroups = combined.filter(g => g.category === category);
      ApiService.saveGroups(category, catGroups).catch(console.warn);
      return combined;
    });
  };

  const deleteGroup = (category: TournamentCategory, groupName: string) => {
    setGroups(prev => {
      const updated = prev.filter(g => !(g.category === category && g.groupName === groupName));
      safeLocalStorageSet('wabupcup_groups', JSON.stringify(updated));
      const catGroups = updated.filter(g => g.category === category);
      ApiService.saveGroups(category, catGroups).catch(console.warn);
      return updated;
    });
  };

  const addTeamToGroup = (category: TournamentCategory, groupName: string, team: GroupTeamItem) => {
    setGroups(prev => {
      const updated = prev.map(g => {
        if (g.category === category && g.groupName === groupName) {
          if (g.teams.some(t => t.name === team.name)) return g;
          return {
            ...g,
            teams: [...g.teams, { ...team, seed: g.teams.length + 1 }],
          };
        }
        return g;
      });
      safeLocalStorageSet('wabupcup_groups', JSON.stringify(updated));
      const catGroups = updated.filter(g => g.category === category);
      ApiService.saveGroups(category, catGroups).catch(console.warn);
      return updated;
    });
  };

  const removeTeamFromGroup = (category: TournamentCategory, groupName: string, teamName: string) => {
    setGroups(prev => {
      const updated = prev.map(g => {
        if (g.category === category && g.groupName === groupName) {
          return {
            ...g,
            teams: g.teams.filter(t => t.name !== teamName),
          };
        }
        return g;
      });
      safeLocalStorageSet('wabupcup_groups', JSON.stringify(updated));
      const catGroups = updated.filter(g => g.category === category);
      ApiService.saveGroups(category, catGroups).catch(console.warn);
      return updated;
    });
  };

  const moveTeamBetweenGroups = (
    category: TournamentCategory,
    sourceGroupName: string,
    targetGroupName: string,
    teamName: string
  ) => {
    setGroups(prev => {
      let teamObj: GroupTeamItem | undefined;
      const withoutTeam = prev.map(g => {
        if (g.category === category && g.groupName === sourceGroupName) {
          const found = g.teams.find(t => t.name === teamName);
          if (found) teamObj = found;
          return {
            ...g,
            teams: g.teams.filter(t => t.name !== teamName),
          };
        }
        return g;
      });

      if (!teamObj) return prev;

      const added = withoutTeam.map(g => {
        if (g.category === category && g.groupName === targetGroupName) {
          if (!g.teams.some(t => t.name === teamName)) {
            return {
              ...g,
              teams: [...g.teams, { ...teamObj!, seed: g.teams.length + 1 }],
            };
          }
        }
        return g;
      });

      safeLocalStorageSet('wabupcup_groups', JSON.stringify(added));
      const catGroups = added.filter(g => g.category === category);
      ApiService.saveGroups(category, catGroups).catch(console.warn);
      return added;
    });
  };

  const generateKnockoutMatches = (
    category: TournamentCategory,
    numGroups: number,
    startMatchCounter: number,
    baseDate: string,
    defaultVenue: string,
    kickoffTimes: string[],
    pitches: string[]
  ): MatchItem[] => {
    const generatedKnockout: MatchItem[] = [];
    let counter = startMatchCounter;

    const grandFinalId = `match-${category.toLowerCase()}-final-${Date.now()}`;
    const thirdPlaceId = `match-${category.toLowerCase()}-3rd-${Date.now()}`;

    const groupLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

    if (numGroups === 2) {
      generatedKnockout.push({
        id: thirdPlaceId,
        matchNumber: counter++,
        category,
        round: 'Perebutan Juara 3',
        roundIndex: 4,
        teamA: { name: 'Runner-up Grup A', institution: 'Menunggu Hasil Grup' },
        teamB: { name: 'Runner-up Grup B', institution: 'Menunggu Hasil Grup' },
        date: '2026-10-31',
        time: '16:00',
        pitch: defaultVenue,
        status: 'UPCOMING',
      });
      generatedKnockout.push({
        id: grandFinalId,
        matchNumber: counter++,
        category,
        round: 'GRAND FINAL WABUP CUP 2026',
        roundIndex: 5,
        teamA: { name: 'Juara Grup A', institution: 'Menunggu Hasil Grup' },
        teamB: { name: 'Juara Grup B', institution: 'Menunggu Hasil Grup' },
        date: '2026-10-31',
        time: '19:00',
        pitch: defaultVenue,
        status: 'UPCOMING',
      });
    } else if (numGroups >= 3 && numGroups <= 4) {
      // 3 - 4 Grup (UMUM: 4 Grup -> 8 Besar / QF)
      const qfPairings = [
        { tA: 'Juara Grup A', tB: 'Runner-up Grup B', nextId: sf1Id, slot: 'A' as const },
        { tA: 'Juara Grup C', tB: numGroups >= 4 ? 'Runner-up Grup D' : 'Runner-up Grup A', nextId: sf1Id, slot: 'B' as const },
        { tA: 'Juara Grup B', tB: 'Runner-up Grup A', nextId: sf2Id, slot: 'A' as const },
        { tA: numGroups >= 4 ? 'Juara Grup D' : 'Juara Grup B', tB: 'Runner-up Grup C', nextId: sf2Id, slot: 'B' as const },
      ];

      qfPairings.forEach((pair, idx) => {
        generatedKnockout.push({
          id: qfIds[idx],
          matchNumber: counter++,
          category,
          round: `Perempat Final ${idx + 1} (8 Besar)`,
          roundIndex: 2,
          teamA: { name: pair.tA, institution: 'Menunggu Hasil Grup' },
          teamB: { name: pair.tB, institution: 'Menunggu Hasil Grup' },
          date: '2026-10-29',
          time: kickoffTimes[idx % kickoffTimes.length],
          pitch: pitches[idx % pitches.length],
          status: 'UPCOMING',
          nextMatchId: pair.nextId,
          nextMatchSlot: pair.slot,
        });
      });

      // 2 Semifinal
      generatedKnockout.push({
        id: sf1Id,
        matchNumber: counter++,
        category,
        round: 'Semifinal 1',
        roundIndex: 3,
        teamA: { name: 'Pemenang Perempat Final 1', institution: 'TBD' },
        teamB: { name: 'Pemenang Perempat Final 2', institution: 'TBD' },
        date: '2026-10-30',
        time: '15:00',
        pitch: defaultVenue,
        status: 'UPCOMING',
        nextMatchId: grandFinalId,
        nextMatchSlot: 'A',
      });
      generatedKnockout.push({
        id: sf2Id,
        matchNumber: counter++,
        category,
        round: 'Semifinal 2',
        roundIndex: 3,
        teamA: { name: 'Pemenang Perempat Final 3', institution: 'TBD' },
        teamB: { name: 'Pemenang Perempat Final 4', institution: 'TBD' },
        date: '2026-10-30',
        time: '16:30',
        pitch: defaultVenue,
        status: 'UPCOMING',
        nextMatchId: grandFinalId,
        nextMatchSlot: 'B',
      });

      // Perebutan Juara 3 & Grand Final
      generatedKnockout.push({
        id: thirdPlaceId,
        matchNumber: counter++,
        category,
        round: 'Perebutan Juara 3',
        roundIndex: 4,
        teamA: { name: 'Kalah Semifinal 1', institution: 'TBD' },
        teamB: { name: 'Kalah Semifinal 2', institution: 'TBD' },
        date: '2026-10-31',
        time: '16:00',
        pitch: defaultVenue,
        status: 'UPCOMING',
      });
      generatedKnockout.push({
        id: grandFinalId,
        matchNumber: counter++,
        category,
        round: 'GRAND FINAL WABUP CUP 2026',
        roundIndex: 5,
        teamA: { name: 'Pemenang Semifinal 1', institution: 'TBD' },
        teamB: { name: 'Pemenang Semifinal 2', institution: 'TBD' },
        date: '2026-10-31',
        time: '19:00',
        pitch: defaultVenue,
        status: 'UPCOMING',
      });
    } else if (numGroups >= 5 && numGroups <= 8) {
      // 5 - 8 Grup (INSTANSI, DESA: 6 Grup -> 8 Besar / QF dengan 6 Juara + 2 Runner-up Terbaik)
      const qfPairings = [
        { tA: 'Juara Grup A', tB: 'Runner-up Terbaik 1', nextId: sf1Id, slot: 'A' as const },
        { tA: 'Juara Grup C', tB: numGroups >= 4 ? 'Juara Grup D' : 'Runner-up Grup A', nextId: sf1Id, slot: 'B' as const },
        { tA: 'Juara Grup B', tB: 'Runner-up Terbaik 2', nextId: sf2Id, slot: 'A' as const },
        { tA: numGroups >= 6 ? 'Juara Grup E' : 'Juara Grup B', tB: numGroups >= 6 ? 'Juara Grup F' : 'Runner-up Grup C', nextId: sf2Id, slot: 'B' as const },
      ];

      qfPairings.forEach((pair, idx) => {
        generatedKnockout.push({
          id: qfIds[idx],
          matchNumber: counter++,
          category,
          round: `Perempat Final ${idx + 1} (8 Besar)`,
          roundIndex: 2,
          teamA: { name: pair.tA, institution: 'Menunggu Hasil Grup' },
          teamB: { name: pair.tB, institution: 'Menunggu Hasil Grup' },
          date: '2026-10-29',
          time: kickoffTimes[idx % kickoffTimes.length],
          pitch: pitches[idx % pitches.length],
          status: 'UPCOMING',
          nextMatchId: pair.nextId,
          nextMatchSlot: pair.slot,
        });
      });

      // 2 Semifinal
      generatedKnockout.push({
        id: sf1Id,
        matchNumber: counter++,
        category,
        round: 'Semifinal 1',
        roundIndex: 3,
        teamA: { name: 'Pemenang Perempat Final 1', institution: 'TBD' },
        teamB: { name: 'Pemenang Perempat Final 2', institution: 'TBD' },
        date: '2026-10-30',
        time: '15:00',
        pitch: defaultVenue,
        status: 'UPCOMING',
        nextMatchId: grandFinalId,
        nextMatchSlot: 'A',
      });
      generatedKnockout.push({
        id: sf2Id,
        matchNumber: counter++,
        category,
        round: 'Semifinal 2',
        roundIndex: 3,
        teamA: { name: 'Pemenang Perempat Final 3', institution: 'TBD' },
        teamB: { name: 'Pemenang Perempat Final 4', institution: 'TBD' },
        date: '2026-10-30',
        time: '16:30',
        pitch: defaultVenue,
        status: 'UPCOMING',
        nextMatchId: grandFinalId,
        nextMatchSlot: 'B',
      });

      // Perebutan Juara 3 & Grand Final
      generatedKnockout.push({
        id: thirdPlaceId,
        matchNumber: counter++,
        category,
        round: 'Perebutan Juara 3',
        roundIndex: 4,
        teamA: { name: 'Kalah Semifinal 1', institution: 'TBD' },
        teamB: { name: 'Kalah Semifinal 2', institution: 'TBD' },
        date: '2026-10-31',
        time: '16:00',
        pitch: defaultVenue,
        status: 'UPCOMING',
      });
      generatedKnockout.push({
        id: grandFinalId,
        matchNumber: counter++,
        category,
        round: 'GRAND FINAL WABUP CUP 2026',
        roundIndex: 5,
        teamA: { name: 'Pemenang Semifinal 1', institution: 'TBD' },
        teamB: { name: 'Pemenang Semifinal 2', institution: 'TBD' },
        date: '2026-10-31',
        time: '19:00',
        pitch: defaultVenue,
        status: 'UPCOMING',
      });
    } else if (numGroups >= 9 && numGroups <= 11) {
      // 9 - 11 Grup (SD: 11 Grup -> 22 Besar: 6 Play-Off + 8 Laga 16 Besar [10 BYE])
      const poIds = Array.from({ length: 6 }, (_, i) => `match-${category.toLowerCase()}-po-${i + 1}-${Date.now()}`);
      const r16Ids = Array.from({ length: 8 }, (_, i) => `match-${category.toLowerCase()}-r16-${i + 1}-${Date.now()}`);

      // 6 Laga Play-off 22 Besar
      const poPairings = [
        { tA: 'Runner-up Grup A', tB: 'Runner-up Grup B', targetR16: r16Ids[0] },
        { tA: 'Runner-up Grup C', tB: 'Runner-up Grup D', targetR16: r16Ids[1] },
        { tA: 'Runner-up Grup E', tB: 'Runner-up Grup F', targetR16: r16Ids[2] },
        { tA: 'Runner-up Grup G', tB: 'Runner-up Grup H', targetR16: r16Ids[3] },
        { tA: 'Runner-up Grup I', tB: 'Runner-up Grup J', targetR16: r16Ids[4] },
        { tA: 'Runner-up Grup K', tB: 'Juara Grup K',     targetR16: r16Ids[5] },
      ];

      poPairings.forEach((pair, idx) => {
        generatedKnockout.push({
          id: poIds[idx],
          matchNumber: counter++,
          category,
          round: `Play-off 22 Besar - Match ${idx + 1}`,
          roundIndex: 1,
          teamA: { name: pair.tA, institution: 'Menunggu Hasil Grup' },
          teamB: { name: pair.tB, institution: 'Menunggu Hasil Grup' },
          date: '2026-10-26',
          time: kickoffTimes[idx % kickoffTimes.length],
          pitch: pitches[idx % pitches.length],
          status: 'UPCOMING',
          nextMatchId: pair.targetR16,
          nextMatchSlot: 'B',
        });
      });

      // 8 Laga 16 Besar:
      // Match 1-6: Juara Grup A-F (HAK BYE) vs Pemenang Play-off 1-6
      // Match 7: Juara Grup G vs Juara Grup H
      // Match 8: Juara Grup I vs Juara Grup J
      for (let i = 0; i < 8; i++) {
        const assignedQfId = qfIds[Math.floor(i / 2)];
        const assignedQfSlot: 'A' | 'B' = i % 2 === 0 ? 'A' : 'B';
        let tAName = '';
        let tBName = '';

        if (i < 6) {
          tAName = `Juara Grup ${groupLetters[i]}`;
          tBName = `Pemenang Play-off ${i + 1}`;
        } else if (i === 6) {
          tAName = 'Juara Grup G';
          tBName = 'Juara Grup H';
        } else {
          tAName = 'Juara Grup I';
          tBName = 'Juara Grup J';
        }

        generatedKnockout.push({
          id: r16Ids[i],
          matchNumber: counter++,
          category,
          round: `Babak 16 Besar - Match ${i + 1}`,
          roundIndex: 2,
          teamA: { name: tAName, institution: i < 6 ? 'Lolos Otomatis (BYE)' : 'Menunggu Hasil Grup' },
          teamB: { name: tBName, institution: 'TBD' },
          date: '2026-10-28',
          time: kickoffTimes[i % kickoffTimes.length],
          pitch: pitches[i % pitches.length],
          status: 'UPCOMING',
          nextMatchId: assignedQfId,
          nextMatchSlot: assignedQfSlot,
        });
      }

      // 4 Perempat Final (8 Besar)
      for (let i = 0; i < 4; i++) {
        const assignedNextId = i < 2 ? sf1Id : sf2Id;
        const assignedNextSlot: 'A' | 'B' = i % 2 === 0 ? 'A' : 'B';
        generatedKnockout.push({
          id: qfIds[i],
          matchNumber: counter++,
          category,
          round: `Perempat Final ${i + 1} (8 Besar)`,
          roundIndex: 3,
          teamA: { name: `Pemenang 16 Besar Match ${i * 2 + 1}`, institution: 'TBD' },
          teamB: { name: `Pemenang 16 Besar Match ${i * 2 + 2}`, institution: 'TBD' },
          date: '2026-10-29',
          time: kickoffTimes[i % kickoffTimes.length],
          pitch: pitches[i % pitches.length],
          status: 'UPCOMING',
          nextMatchId: assignedNextId,
          nextMatchSlot: assignedNextSlot,
        });
      }

      // 2 Semifinal
      generatedKnockout.push({
        id: sf1Id,
        matchNumber: counter++,
        category,
        round: 'Semifinal 1',
        roundIndex: 4,
        teamA: { name: 'Pemenang Perempat Final 1', institution: 'TBD' },
        teamB: { name: 'Pemenang Perempat Final 2', institution: 'TBD' },
        date: '2026-10-30',
        time: '15:00',
        pitch: defaultVenue,
        status: 'UPCOMING',
        nextMatchId: grandFinalId,
        nextMatchSlot: 'A',
      });
      generatedKnockout.push({
        id: sf2Id,
        matchNumber: counter++,
        category,
        round: 'Semifinal 2',
        roundIndex: 4,
        teamA: { name: 'Pemenang Perempat Final 3', institution: 'TBD' },
        teamB: { name: 'Pemenang Perempat Final 4', institution: 'TBD' },
        date: '2026-10-30',
        time: '16:30',
        pitch: defaultVenue,
        status: 'UPCOMING',
        nextMatchId: grandFinalId,
        nextMatchSlot: 'B',
      });

      // Perebutan Juara 3 & Grand Final
      generatedKnockout.push({
        id: thirdPlaceId,
        matchNumber: counter++,
        category,
        round: 'Perebutan Juara 3',
        roundIndex: 5,
        teamA: { name: 'Kalah Semifinal 1', institution: 'TBD' },
        teamB: { name: 'Kalah Semifinal 2', institution: 'TBD' },
        date: '2026-10-31',
        time: '16:00',
        pitch: defaultVenue,
        status: 'UPCOMING',
      });
      generatedKnockout.push({
        id: grandFinalId,
        matchNumber: counter++,
        category,
        round: 'GRAND FINAL WABUP CUP 2026',
        roundIndex: 6,
        teamA: { name: 'Pemenang Semifinal 1', institution: 'TBD' },
        teamB: { name: 'Pemenang Semifinal 2', institution: 'TBD' },
        date: '2026-10-31',
        time: '19:00',
        pitch: defaultVenue,
        status: 'UPCOMING',
      });
    } else {
      // 12+ Grup (SMA: 16 Grup, SMP: 17 Grup -> BABAK 32 BESAR: 16 Laga R32 -> 8 Laga R16 -> 4 QF -> 2 SF -> 3rd/Final)
      const r32Ids = Array.from({ length: 16 }, (_, i) => `match-${category.toLowerCase()}-r32-${i + 1}-${Date.now()}`);
      const r16Ids = Array.from({ length: 8 }, (_, i) => `match-${category.toLowerCase()}-r16-${i + 1}-${Date.now()}`);

      // 16 Laga 32 Besar
      for (let i = 0; i < 16; i++) {
        const assignedR16Id = r16Ids[Math.floor(i / 2)];
        const assignedR16Slot: 'A' | 'B' = i % 2 === 0 ? 'A' : 'B';
        let tAName = '';
        let tBName = '';

        if (numGroups === 16) {
          // Format SMA (16 Grup A s/d P)
          if (i < 8) {
            const letterA = groupLetters[i * 2];       // A, C, E, G, I, K, M, O
            const letterB = groupLetters[i * 2 + 1];   // B, D, F, H, J, L, N, P
            tAName = `Juara Grup ${letterA}`;
            tBName = `Runner-up Grup ${letterB}`;
          } else {
            const idxBase = i - 8;
            const letterA = groupLetters[idxBase * 2 + 1]; // B, D, F, H, J, L, N, P
            const letterB = groupLetters[idxBase * 2];     // A, C, E, G, I, K, M, O
            tAName = `Juara Grup ${letterA}`;
            tBName = `Runner-up Grup ${letterB}`;
          }
        } else if (numGroups >= 17) {
          // Format SMP (17 Grup A s/d Q)
          if (i < 15) {
            tAName = `Juara Grup ${groupLetters[i]}`;
            tBName = `Runner-up Terbaik ${15 - i}`;
          } else {
            tAName = 'Juara Grup P';
            tBName = 'Juara Grup Q';
          }
        } else {
          tAName = `Juara Grup ${groupLetters[i % groupLetters.length]}`;
          tBName = `Runner-up Grup ${groupLetters[(i + 1) % groupLetters.length]}`;
        }

        generatedKnockout.push({
          id: r32Ids[i],
          matchNumber: counter++,
          category,
          round: `Babak 32 Besar - Match ${i + 1}`,
          roundIndex: 1,
          teamA: { name: tAName, institution: 'Menunggu Hasil Grup' },
          teamB: { name: tBName, institution: 'Menunggu Hasil Grup' },
          date: '2026-10-26',
          time: kickoffTimes[i % kickoffTimes.length],
          pitch: pitches[i % pitches.length],
          status: 'UPCOMING',
          nextMatchId: assignedR16Id,
          nextMatchSlot: assignedR16Slot,
        });
      }

      // 8 Laga 16 Besar
      for (let i = 0; i < 8; i++) {
        const assignedQfId = qfIds[Math.floor(i / 2)];
        const assignedQfSlot: 'A' | 'B' = i % 2 === 0 ? 'A' : 'B';
        generatedKnockout.push({
          id: r16Ids[i],
          matchNumber: counter++,
          category,
          round: `Babak 16 Besar - Match ${i + 1}`,
          roundIndex: 2,
          teamA: { name: `Pemenang 32 Besar Match ${i * 2 + 1}`, institution: 'TBD' },
          teamB: { name: `Pemenang 32 Besar Match ${i * 2 + 2}`, institution: 'TBD' },
          date: '2026-10-28',
          time: kickoffTimes[i % kickoffTimes.length],
          pitch: pitches[i % pitches.length],
          status: 'UPCOMING',
          nextMatchId: assignedQfId,
          nextMatchSlot: assignedQfSlot,
        });
      }

      // 4 Perempat Final (8 Besar)
      for (let i = 0; i < 4; i++) {
        const assignedNextId = i < 2 ? sf1Id : sf2Id;
        const assignedNextSlot: 'A' | 'B' = i % 2 === 0 ? 'A' : 'B';
        generatedKnockout.push({
          id: qfIds[i],
          matchNumber: counter++,
          category,
          round: `Perempat Final ${i + 1} (8 Besar)`,
          roundIndex: 3,
          teamA: { name: `Pemenang 16 Besar Match ${i * 2 + 1}`, institution: 'TBD' },
          teamB: { name: `Pemenang 16 Besar Match ${i * 2 + 2}`, institution: 'TBD' },
          date: '2026-10-29',
          time: kickoffTimes[i % kickoffTimes.length],
          pitch: pitches[i % pitches.length],
          status: 'UPCOMING',
          nextMatchId: assignedNextId,
          nextMatchSlot: assignedNextSlot,
        });
      }

      // 2 Semifinal
      generatedKnockout.push({
        id: sf1Id,
        matchNumber: counter++,
        category,
        round: 'Semifinal 1',
        roundIndex: 4,
        teamA: { name: 'Pemenang Perempat Final 1', institution: 'TBD' },
        teamB: { name: 'Pemenang Perempat Final 2', institution: 'TBD' },
        date: '2026-10-30',
        time: '15:00',
        pitch: defaultVenue,
        status: 'UPCOMING',
        nextMatchId: grandFinalId,
        nextMatchSlot: 'A',
      });
      generatedKnockout.push({
        id: sf2Id,
        matchNumber: counter++,
        category,
        round: 'Semifinal 2',
        roundIndex: 4,
        teamA: { name: 'Pemenang Perempat Final 3', institution: 'TBD' },
        teamB: { name: 'Pemenang Perempat Final 4', institution: 'TBD' },
        date: '2026-10-30',
        time: '16:30',
        pitch: defaultVenue,
        status: 'UPCOMING',
        nextMatchId: grandFinalId,
        nextMatchSlot: 'B',
      });

      // Perebutan Juara 3 & Grand Final
      generatedKnockout.push({
        id: thirdPlaceId,
        matchNumber: counter++,
        category,
        round: 'Perebutan Juara 3',
        roundIndex: 5,
        teamA: { name: 'Kalah Semifinal 1', institution: 'TBD' },
        teamB: { name: 'Kalah Semifinal 2', institution: 'TBD' },
        date: '2026-10-31',
        time: '16:00',
        pitch: defaultVenue,
        status: 'UPCOMING',
      });
      generatedKnockout.push({
        id: grandFinalId,
        matchNumber: counter++,
        category,
        round: 'GRAND FINAL WABUP CUP 2026',
        roundIndex: 6,
        teamA: { name: 'Pemenang Semifinal 1', institution: 'TBD' },
        teamB: { name: 'Pemenang Semifinal 2', institution: 'TBD' },
        date: '2026-10-31',
        time: '19:00',
        pitch: defaultVenue,
        status: 'UPCOMING',
      });
    }

    return generatedKnockout;
  };

  const generateMatchesFromGroups = (category: TournamentCategory): { success: boolean; message: string; matches?: MatchItem[] } => {
    const catGroups = groups.filter(g => g.category === category);
    if (catGroups.length === 0) {
      return { success: false, message: `Belum ada grup yang dibentuk untuk kategori ${category}` };
    }

    const kickoffTimes = ['08:00', '09:15', '10:30', '13:30', '14:45', '16:00', '19:00', '20:15'];
    const defaultVenue = config.venueName || 'Gedung Utama GOR Tawang Alun Banyuwangi';
    const pitches = [
      defaultVenue,
      `${defaultVenue} - Lapangan A`,
      `${defaultVenue} - Lapangan B`
    ];
    let matchCounter = 1;
    const generatedMatches: MatchItem[] = [];
    const baseDate = config.tournamentStartDate || '2026-10-24';

    catGroups.forEach(grp => {
      const gTeams = grp.teams;
      for (let i = 0; i < gTeams.length; i++) {
        for (let j = i + 1; j < gTeams.length; j++) {
          const tA = gTeams[i];
          const tB = gTeams[j];
          const timeSlot = kickoffTimes[(matchCounter - 1) % kickoffTimes.length];
          const pitch = pitches[(matchCounter - 1) % pitches.length];
          const dateOffset = Math.floor((matchCounter - 1) / kickoffTimes.length);
          const matchDateObj = new Date(baseDate);
          matchDateObj.setDate(matchDateObj.getDate() + dateOffset);
          const matchDateStr = matchDateObj.toISOString().split('T')[0];

          // Preserve existing match if already exists with scores/events
          const existing = matches.find(m =>
            m.category === category &&
            m.group === grp.groupName &&
            ((m.teamA.name === tA.name && m.teamB.name === tB.name) ||
             (m.teamA.name === tB.name && m.teamB.name === tA.name))
          );

          if (existing) {
            generatedMatches.push({
              ...existing,
              matchNumber: matchCounter++,
            });
          } else {
            generatedMatches.push({
              id: `match-${category.toLowerCase()}-grp-${grp.groupName.replace(/\s+/g, '').toLowerCase()}-${i}-${j}-${Date.now()}`,
              matchNumber: matchCounter++,
              category,
              round: `Fase Grup - ${grp.groupName}`,
              roundIndex: 1,
              group: grp.groupName,
              teamA: { name: tA.name, institution: tA.institution, logo: tA.logo },
              teamB: { name: tB.name, institution: tB.institution, logo: tB.logo },
              date: matchDateStr,
              time: timeSlot,
              pitch,
              status: 'UPCOMING',
            });
          }
        }
      }
    });

    const numGroups = catGroups.length;
    const knockoutMatches = generateKnockoutMatches(
      category,
      numGroups,
      matchCounter,
      baseDate,
      defaultVenue,
      kickoffTimes,
      pitches
    );
    generatedMatches.push(...knockoutMatches);

    setMatches(prev => {
      const filtered = prev.filter(m => m.category !== category);
      const combined = [...filtered, ...generatedMatches];
      safeLocalStorageSet('wabupcup_matches', JSON.stringify(combined));
      return combined;
    });

    ApiService.replaceCategoryMatches(category, generatedMatches).catch(console.warn);

    return {
      success: true,
      message: `Jadwal pertandingan fase grup & bagan knockout berhasil dibuat ulang dari susunan grup saat ini (${generatedMatches.length} pertandingan).`,
      matches: generatedMatches,
    };
  };

  const syncKnockoutFromStandings = async (
    category: TournamentCategory | 'ALL'
  ): Promise<{ success: boolean; message: string; updatedCount?: number }> => {
    if (category === 'ALL') {
      const activeCats: TournamentCategory[] = categories.length > 0
        ? categories.map(c => c.id as TournamentCategory)
        : ['SD', 'SMP', 'SMA', 'INSTANSI', 'DESA', 'UMUM'];
      let totalUpdated = 0;
      for (const cat of activeCats) {
        const res = await syncKnockoutFromStandings(cat);
        if (res.success && res.updatedCount) {
          totalUpdated += res.updatedCount;
        }
      }
      return {
        success: true,
        message: `Sinkronisasi knockout berhasil untuk semua ${activeCats.length} kategori (${totalUpdated} slot tim terisi/diperbarui).`,
        updatedCount: totalUpdated,
      };
    }

    const catGroups = groups.filter(g => g.category === category);
    if (catGroups.length === 0) {
      return { success: false, message: `Belum ada susunan grup yang dibentuk untuk kategori ${category}.` };
    }

    const catMatches = matches.filter(m => m.category === category);
    const isKnockout = (m: MatchItem) =>
      !m.group ||
      m.round.toLowerCase().includes('final') ||
      m.round.toLowerCase().includes('16 besar') ||
      m.round.toLowerCase().includes('22 besar') ||
      m.round.toLowerCase().includes('32 besar') ||
      m.round.toLowerCase().includes('8 besar') ||
      m.round.toLowerCase().includes('play-off') ||
      m.round.toLowerCase().includes('playoff') ||
      m.round.toLowerCase().includes('perempat') ||
      m.round.toLowerCase().includes('gugur');

    let currentKnockout = catMatches.filter(isKnockout);
    let needsFullReplace = false;

    if (currentKnockout.length === 0) {
      const maxMatchNum = catMatches.reduce((max, m) => Math.max(max, m.matchNumber || 0), 0);
      const kickoffTimes = ['08:00', '09:15', '10:30', '13:30', '14:45', '16:00', '19:00', '20:15'];
      const defaultVenue = config.venueName || 'Gedung Utama GOR Tawang Alun Banyuwangi';
      const pitches = [
        defaultVenue,
        `${defaultVenue} - Lapangan A`,
        `${defaultVenue} - Lapangan B`,
      ];
      currentKnockout = generateKnockoutMatches(
        category,
        catGroups.length,
        maxMatchNum + 1,
        config.tournamentStartDate || '2026-10-24',
        defaultVenue,
        kickoffTimes,
        pitches
      );
      needsFullReplace = true;
    }

    const computedStandings = computeStandingsFromData(matches, groups, registrations, category);

    // Guard: Cek apakah suatu grup sudah menyelesaikan semua pertandingannya
    const isGroupCompleted = (groupName: string) => {
      const gMatches = catMatches.filter(
        m => m.group && m.group.toLowerCase().trim() === groupName.toLowerCase().trim()
      );
      return gMatches.length > 0 && gMatches.every(m => m.status === 'FINISHED');
    };
    const allGroupsFinished = catGroups.length > 0 && catGroups.every(grp => isGroupCompleted(grp.groupName));

    // Mini-standings cross-group rankings for Best Winners and Best Runner-ups
    interface GroupRankedTeam {
      groupName: string;
      rankInGroup: number;
      teamName: string;
      institution?: string;
      logo?: string;
      points: number;
      goalDiff: number;
      goalsFor: number;
      goalsAgainst: number;
    }

    const allJuara: GroupRankedTeam[] = [];
    const allRunnerUp: GroupRankedTeam[] = [];
    const groupJuaraMap: Record<string, GroupRankedTeam> = {};
    const groupRunnerUpMap: Record<string, GroupRankedTeam> = {};

    catGroups.forEach(grp => {
      const isDone = isGroupCompleted(grp.groupName);
      const gLetter = grp.groupName.replace(/grup\s*/i, '').trim().toUpperCase();
      const gKey = `${category}:::${grp.groupName}`;
      const gStandings = computedStandings[gKey];

      // Hanya isi pemenang grup jika pertandingan di grup tersebut telah 100% tuntas
      if (isDone && gStandings && gStandings.length > 0) {
        if (gStandings[0]) {
          const item: GroupRankedTeam = {
            groupName: grp.groupName,
            rankInGroup: 1,
            teamName: gStandings[0].teamName,
            institution: gStandings[0].institution,
            logo: gStandings[0].teamLogo,
            points: gStandings[0].points || 0,
            goalDiff: (gStandings[0].goalsFor || 0) - (gStandings[0].goalsAgainst || 0),
            goalsFor: gStandings[0].goalsFor || 0,
            goalsAgainst: gStandings[0].goalsAgainst || 0,
          };
          groupJuaraMap[gLetter] = item;
          if (allGroupsFinished) {
            allJuara.push(item);
          }
        }
        if (gStandings[1]) {
          const item: GroupRankedTeam = {
            groupName: grp.groupName,
            rankInGroup: 2,
            teamName: gStandings[1].teamName,
            institution: gStandings[1].institution,
            logo: gStandings[1].teamLogo,
            points: gStandings[1].points || 0,
            goalDiff: (gStandings[1].goalsFor || 0) - (gStandings[1].goalsAgainst || 0),
            goalsFor: gStandings[1].goalsFor || 0,
            goalsAgainst: gStandings[1].goalsAgainst || 0,
          };
          groupRunnerUpMap[gLetter] = item;
          if (allGroupsFinished) {
            allRunnerUp.push(item);
          }
        }
      }
    });

    const sortMiniStandings = (a: GroupRankedTeam, b: GroupRankedTeam) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff;
      if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
      return a.teamName.localeCompare(b.teamName);
    };

    allJuara.sort(sortMiniStandings);
    allRunnerUp.sort(sortMiniStandings);

    let updatedCount = 0;
    const modifiedKnockoutList: MatchItem[] = [];

    const resolveTeamSlot = (teamObj: { name: string; institution?: string; logo?: string }): { name: string; institution?: string; logo?: string; changed: boolean } => {
      let changed = false;
      const res = { ...teamObj };

      // A. Juara Grup X (A-Z)
      const winGrp = res.name.match(/(?:Juara|Pemenang)\s+Grup\s+([A-Za-z])/i);
      if (winGrp) {
        const letter = winGrp[1].toUpperCase();
        const found = groupJuaraMap[letter];
        if (found && res.name !== found.teamName) {
          res.name = found.teamName;
          res.institution = found.institution || res.institution;
          res.logo = found.logo || res.logo;
          changed = true;
        }
      }

      // B. Runner-up Grup X (A-Z)
      const runGrp = res.name.match(/(?:Runner-?up|Peringkat\s+2)\s+Grup\s+([A-Za-z])/i);
      if (runGrp) {
        const letter = runGrp[1].toUpperCase();
        const found = groupRunnerUpMap[letter];
        if (found && res.name !== found.teamName) {
          res.name = found.teamName;
          res.institution = found.institution || res.institution;
          res.logo = found.logo || res.logo;
          changed = true;
        }
      }

      // C. Juara Terbaik N
      const winBest = res.name.match(/(?:Juara|Pemenang)\s+Terbaik\s+(\d+)/i);
      if (winBest) {
        const rankIdx = parseInt(winBest[1], 10) - 1;
        const found = allJuara[rankIdx];
        if (found && res.name !== found.teamName) {
          res.name = found.teamName;
          res.institution = found.institution || res.institution;
          res.logo = found.logo || res.logo;
          changed = true;
        }
      }

      // D. Runner-up Terbaik N
      const runBest = res.name.match(/(?:Runner-?up|Peringkat\s+2)\s+Terbaik\s+(\d+)/i);
      if (runBest) {
        const rankIdx = parseInt(runBest[1], 10) - 1;
        const found = allRunnerUp[rankIdx];
        if (found && res.name !== found.teamName) {
          res.name = found.teamName;
          res.institution = found.institution || res.institution;
          res.logo = found.logo || res.logo;
          changed = true;
        }
      }

      return { ...res, changed };
    };

    const updatedKnockout = currentKnockout.map(m => {
      const resA = resolveTeamSlot(m.teamA);
      const resB = resolveTeamSlot(m.teamB);

      if (resA.changed || resB.changed) {
        updatedCount++;
        const mod: MatchItem = {
          ...m,
          teamA: { ...m.teamA, name: resA.name, institution: resA.institution, logo: resA.logo },
          teamB: { ...m.teamB, name: resB.name, institution: resB.institution, logo: resB.logo },
        };
        modifiedKnockoutList.push(mod);
        return mod;
      }
      return m;
    });

    // Advance winners for finished knockout matches (Playoff -> R16 -> QF -> SF -> Final)
    const finalizedKnockout = updatedKnockout.map(m => {
      if (m.status === 'FINISHED' && (m.winnerId === 'A' || m.winnerId === 'B') && m.nextMatchId) {
        const winningTeam = m.winnerId === 'A' ? m.teamA : m.teamB;
        const targetNextIdx = updatedKnockout.findIndex(nextM => nextM.id === m.nextMatchId);
        if (targetNextIdx >= 0) {
          const target = updatedKnockout[targetNextIdx];
          const isSlotB = m.nextMatchSlot === 'B';
          const curTargetName = isSlotB ? target.teamB.name : target.teamA.name;
          if (curTargetName !== winningTeam.name) {
            const updatedTarget = isSlotB
              ? { ...target, teamB: { ...target.teamB, name: winningTeam.name, institution: winningTeam.institution, logo: winningTeam.logo } }
              : { ...target, teamA: { ...target.teamA, name: winningTeam.name, institution: winningTeam.institution, logo: winningTeam.logo } };
            updatedKnockout[targetNextIdx] = updatedTarget;
            if (!modifiedKnockoutList.some(item => item.id === updatedTarget.id)) {
              modifiedKnockoutList.push(updatedTarget);
            }
            updatedCount++;
          }
        }
      }
      return m;
    });

    const groupMatches = catMatches.filter(m => !isKnockout(m));
    const allCombined = [...groupMatches, ...finalizedKnockout];

    setMatches(prev => {
      const other = prev.filter(m => m.category !== category);
      const combined = [...other, ...allCombined];
      safeLocalStorageSet('wabupcup_matches', JSON.stringify(combined));
      return combined;
    });

    try {
      if (needsFullReplace) {
        await ApiService.replaceCategoryMatches(category, allCombined);
      } else if (modifiedKnockoutList.length > 0) {
        await ApiService.saveMatchesBatch(modifiedKnockoutList);
      }
    } catch (err) {
      console.warn('Could not sync knockout matches to backend:', err);
    }

    const completedGroupsCount = catGroups.filter(grp => isGroupCompleted(grp.groupName)).length;
    const progressNote = completedGroupsCount === catGroups.length
      ? `Semua ${catGroups.length} grup telah tuntas.`
      : `${completedGroupsCount} dari ${catGroups.length} grup telah tuntas. Grup yang sedang berjalan tetap menunggu hasil akhir.`;

    return {
      success: true,
      message: `Bagan knockout kategori ${category} berhasil disinkronkan (${finalizedKnockout.length} match knockout, ${updatedCount} slot tim terisi/diperbarui. ${progressNote})`,
      updatedCount,
    };
  };

  const randomizeGroupStage = (
    category: TournamentCategory,
    teamsPerGroup: number = 3
  ): { success: boolean; message: string; groups?: GroupStageItem[]; matches?: MatchItem[] } => {
    const approvedTeams = registrations
      .filter(r => r.category === category && r.status === 'APPROVED')
      .map(r => ({
        name: r.teamName,
        institution: r.institutionName,
        logo: r.teamLogo,
      }));

    if (approvedTeams.length < 2) {
      return {
        success: false,
        message: `Kategori "${category}" baru memiliki ${approvedTeams.length} tim yang berstatus APPROVED (Disetujui). Minimal diperlukan 2 tim untuk pembagian grup.`,
      };
    }

    const shuffled = [...approvedTeams];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const numGroups = Math.max(1, Math.ceil(shuffled.length / teamsPerGroup));
    const newGroups: GroupStageItem[] = [];

    for (let g = 0; g < numGroups; g++) {
      const letter = alphabet[g] || `G${g + 1}`;
      newGroups.push({
        id: `grp-${category.toLowerCase()}-${letter.toLowerCase()}-${Date.now()}`,
        category,
        groupName: `Grup ${letter}`,
        teams: [],
      });
    }

    shuffled.forEach((team, idx) => {
      const groupIdx = idx % numGroups;
      newGroups[groupIdx].teams.push({
        name: team.name,
        institution: team.institution,
        logo: team.logo,
        seed: newGroups[groupIdx].teams.length + 1,
      });
    });

    setGroups(prev => {
      const filtered = prev.filter(g => g.category !== category);
      const combined = [...filtered, ...newGroups];
      safeLocalStorageSet('wabupcup_groups', JSON.stringify(combined));
      return combined;
    });

    ApiService.saveGroups(category, newGroups).catch(console.warn);

    const kickoffTimes = ['08:00', '09:15', '10:30', '13:30', '14:45', '16:00', '19:00', '20:15'];
    const defaultVenue = config.venueName || 'Gedung Utama GOR Tawang Alun Banyuwangi';
    const pitches = [
      defaultVenue,
      `${defaultVenue} - Lapangan A`,
      `${defaultVenue} - Lapangan B`
    ];
    let matchCounter = 1;
    const generatedMatches: MatchItem[] = [];
    const baseDate = config.tournamentStartDate || '2026-10-24';

    newGroups.forEach(grp => {
      const gTeams = grp.teams;
      for (let i = 0; i < gTeams.length; i++) {
        for (let j = i + 1; j < gTeams.length; j++) {
          const tA = gTeams[i];
          const tB = gTeams[j];
          const timeSlot = kickoffTimes[(matchCounter - 1) % kickoffTimes.length];
          const pitch = pitches[(matchCounter - 1) % pitches.length];
          const dateOffset = Math.floor((matchCounter - 1) / kickoffTimes.length);
          const matchDateObj = new Date(baseDate);
          matchDateObj.setDate(matchDateObj.getDate() + dateOffset);
          const matchDateStr = matchDateObj.toISOString().split('T')[0];

          generatedMatches.push({
            id: `match-${category.toLowerCase()}-grp-${grp.groupName.replace(/\s+/g, '').toLowerCase()}-${i}-${j}-${Date.now()}`,
            matchNumber: matchCounter++,
            category,
            round: `Fase Grup - ${grp.groupName}`,
            roundIndex: 1,
            group: grp.groupName,
            teamA: { name: tA.name, institution: tA.institution, logo: tA.logo },
            teamB: { name: tB.name, institution: tB.institution, logo: tB.logo },
            date: matchDateStr,
            time: timeSlot,
            pitch,
            status: 'UPCOMING',
          });
        }
      }
    });

    const knockoutMatches = generateKnockoutMatches(
      category,
      numGroups,
      matchCounter,
      baseDate,
      defaultVenue,
      kickoffTimes,
      pitches
    );
    generatedMatches.push(...knockoutMatches);

    setMatches(prev => {
      const filtered = prev.filter(m => m.category !== category);
      const combined = [...filtered, ...generatedMatches];
      safeLocalStorageSet('wabupcup_matches', JSON.stringify(combined));
      return combined;
    });

    ApiService.replaceCategoryMatches(category, generatedMatches).catch(console.warn);

    return {
      success: true,
      message: `Berhasil membagi ${approvedTeams.length} tim ke dalam ${newGroups.length} grup (${teamsPerGroup} tim per grup) & menghasilkan jadwal pertandingan lengkap.`,
      groups: newGroups,
      matches: generatedMatches,
    };
  };

  const resetCategoryGroupsAndMatches = async (
    category: TournamentCategory
  ): Promise<{ success: boolean; message: string }> => {
    // 1. Clear groups for this category in local state & storage
    setGroups(prev => {
      const updated = prev.filter(g => g.category !== category);
      safeLocalStorageSet('wabupcup_groups', JSON.stringify(updated));
      return updated;
    });

    // 2. Clear matches for this category in local state & storage
    setMatches(prev => {
      const updated = prev.filter(m => m.category !== category);
      safeLocalStorageSet('wabupcup_matches', JSON.stringify(updated));
      return updated;
    });

    // 3. Clear Standings for this category
    setStandings(prev => {
      const next = { ...prev };
      delete next[category];
      safeLocalStorageSet('wabupcup_standings', JSON.stringify(next));
      return next;
    });

    // 4. Wipe on server database (MySQL/TiDB)
    try {
      const res = await ApiService.resetCategoryGroupsAndMatches(category);
      return res;
    } catch (err: any) {
      console.warn('Error resetting category groups/matches on server:', err);
      return {
        success: true,
        message: `Grup dan jadwal kategori ${category} berhasil dikosongkan.`,
      };
    }
  };

  // Matches & Players Management
  const refreshMatches = useCallback(async () => {
    try {
      const serverMatches = await ApiService.getMatches();
      if (Array.isArray(serverMatches)) {
        setMatches(serverMatches);
        safeLocalStorageSet('wabupcup_matches', JSON.stringify(serverMatches));
      }
    } catch (err) {
      console.warn('Could not refresh matches from server:', err);
    }
  }, []);

  const refreshPlayers = useCallback(async (hasStatsOnly = false) => {
    try {
      const isAdminLoggedIn = !!safeLocalStorageGet('wabupcup_current_admin', null);
      const serverPlayers = await ApiService.getPlayers(undefined, undefined, false, hasStatsOnly || !isAdminLoggedIn);
      if (Array.isArray(serverPlayers)) {
        setPlayers(serverPlayers);
        safeLocalStorageSet('wabupcup_players', JSON.stringify(serverPlayers));
      }
    } catch (err) {
      console.warn('Could not refresh players from server:', err);
    }
  }, []);

  const savePlayer = async (player: PlayerItem): Promise<PlayerItem> => {
    const item: PlayerItem = {
      ...player,
      id: player.id || `ply-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      jerseyNumber: Number(player.jerseyNumber) || 0,
      position: player.position || 'Flank',
      category: player.category || 'SMA',
      goals: Number(player.goals) || 0,
      yellowCards: Number(player.yellowCards) || 0,
      redCards: Number(player.redCards) || 0,
    };

    setPlayers(prev => {
      const idx = prev.findIndex(p => p.id === item.id);
      let updated: PlayerItem[];
      if (idx >= 0) {
        updated = prev.map(p => (p.id === item.id ? item : p));
      } else {
        updated = [...prev, item];
      }
      safeLocalStorageSet('wabupcup_players', JSON.stringify(updated));
      return updated;
    });

    try {
      const serverResult = await ApiService.savePlayer(item);
      if (serverResult && serverResult.id) {
        setPlayers(prev => {
          const updated = prev.map(p => (p.id === serverResult.id ? serverResult : p));
          safeLocalStorageSet('wabupcup_players', JSON.stringify(updated));
          return updated;
        });
        return serverResult;
      }
    } catch (err) {
      console.warn('Backend server save player warning:', err);
    }
    return item;
  };

  const batchImportPlayers = async (newPlayers: PlayerItem[]): Promise<{ success: boolean; count: number }> => {
    const formatted = newPlayers.map((p, idx) => ({
      ...p,
      id: p.id || `ply-${Date.now()}-${idx}-${Math.floor(Math.random() * 1000)}`,
    }));

    setPlayers(prev => {
      const existingMap = new Map(prev.map(p => [`${p.teamName}:::${p.name}`, p]));
      for (const p of formatted) {
        existingMap.set(`${p.teamName}:::${p.name}`, p);
      }
      const merged = Array.from(existingMap.values());
      safeLocalStorageSet('wabupcup_players', JSON.stringify(merged));
      return merged;
    });

    try {
      const res = await ApiService.batchImportPlayers(formatted);
      return { success: res.success, count: res.count || formatted.length };
    } catch {
      return { success: true, count: formatted.length };
    }
  };

  const deletePlayer = async (id: string): Promise<void> => {
    setPlayers(prev => {
      const updated = prev.filter(p => p.id !== id);
      safeLocalStorageSet('wabupcup_players', JSON.stringify(updated));
      return updated;
    });
    try {
      await ApiService.deletePlayer(id);
    } catch (e) {
      console.warn('Error deleting player from api:', e);
    }
  };

  // Live Score & Standings Automation
  const updateMatchLiveScore = async (
    matchId: string,
    scoreA?: number,
    scoreB?: number,
    status?: MatchStatus,
    liveMinute?: string,
    events?: MatchEvent[]
  ) => {
    const currentMatch = matches.find(m => m.id === matchId);
    if (!currentMatch) return;

    const finalScoreA = scoreA !== undefined ? scoreA : currentMatch.teamA.score;
    const finalScoreB = scoreB !== undefined ? scoreB : currentMatch.teamB.score;
    const finalStatus = status || currentMatch.status;

    let determinedWinner: 'A' | 'B' | 'DRAW' | undefined = undefined;
    if (finalStatus === 'FINISHED' && finalScoreA !== undefined && finalScoreB !== undefined) {
      if (finalScoreA > finalScoreB) {
        determinedWinner = 'A';
      } else if (finalScoreB > finalScoreA) {
        determinedWinner = 'B';
      } else {
        determinedWinner = 'DRAW';
      }
    }

    const updatedMatch: MatchItem = {
      ...currentMatch,
      teamA: {
        ...currentMatch.teamA,
        score: finalScoreA,
      },
      teamB: {
        ...currentMatch.teamB,
        score: finalScoreB,
      },
      status: finalStatus,
      liveMinute: liveMinute !== undefined ? liveMinute : currentMatch.liveMinute,
      events: events !== undefined ? events : currentMatch.events,
      winnerId: determinedWinner,
    };

    let newMatches = matches.map(m => (m.id === matchId ? updatedMatch : m));
    setMatches(newMatches);
    safeLocalStorageSet('wabupcup_matches', JSON.stringify(newMatches));

    // Immediately calculate and update standings in React state & local storage
    const updatedStandings = computeStandingsFromData(newMatches, groups, registrations);
    setStandings(updatedStandings);
    safeLocalStorageSet('wabupcup_standings', JSON.stringify(updatedStandings));

    if (events !== undefined) {
      const playerStatsMap = new Map<string, { goals: number; yellow: number; red: number }>();
      for (const m of newMatches) {
        if (m.events && Array.isArray(m.events)) {
          for (const ev of m.events) {
            if (!ev.playerName) continue;
            const key = ev.playerName.trim().toLowerCase();
            const curr = playerStatsMap.get(key) || { goals: 0, yellow: 0, red: 0 };
            if (ev.type === 'GOAL') curr.goals += 1;
            if (ev.type === 'YELLOW') curr.yellow += 1;
            if (ev.type === 'RED') curr.red += 1;
            playerStatsMap.set(key, curr);
          }
        }
      }

      setPlayers(prev => {
        const updatedPlayers = prev.map(p => {
          const stats = playerStatsMap.get(p.name.trim().toLowerCase());
          const newGoals = stats ? stats.goals : 0;
          const newYellow = stats ? stats.yellow : 0;
          const newRed = stats ? stats.red : 0;
          if (p.goals !== newGoals || p.yellowCards !== newYellow || p.redCards !== newRed) {
            const mod = {
              ...p,
              goals: newGoals,
              yellowCards: newYellow,
              redCards: newRed,
            };
            // Note: Server-side saveMatch already runs syncPlayerStatsFromMatches atomically,
            // avoiding repetitive PUT /api/players/:id calls to preserve TiDB RU & Vercel FOT.
            return mod;
          }
          return p;
        });
        safeLocalStorageSet('wabupcup_players', JSON.stringify(updatedPlayers));
        return updatedPlayers;
      });
    }

    // Await server persistence so MySQL and server-side state are fully updated
    // Note: Standings are already calculated locally in React state & table_standings is updated by saveMatch
    try {
      await ApiService.saveMatch(updatedMatch);
    } catch (err) {
      console.warn('Could not sync match live score to server:', err);
    }

    // Advance winner to next round if FINISHED and nextMatchId is set
    if (finalStatus === 'FINISHED' && (determinedWinner === 'A' || determinedWinner === 'B') && updatedMatch.nextMatchId) {
      const winningTeam = determinedWinner === 'A' ? updatedMatch.teamA : updatedMatch.teamB;
      const targetNext = newMatches.find(m => m.id === updatedMatch.nextMatchId);
      if (targetNext) {
        const isSlotB = updatedMatch.nextMatchSlot === 'B';
        const updatedNext = isSlotB
          ? {
              ...targetNext,
              teamB: {
                ...targetNext.teamB,
                name: winningTeam.name,
                institution: winningTeam.institution,
                logo: winningTeam.logo,
              },
            }
          : {
              ...targetNext,
              teamA: {
                ...targetNext.teamA,
                name: winningTeam.name,
                institution: winningTeam.institution,
                logo: winningTeam.logo,
              },
            };
        newMatches = newMatches.map(m => (m.id === targetNext.id ? updatedNext : m));
        ApiService.saveMatch(updatedNext).catch(() => {});
      }
    }

    const cat = updatedMatch.category;
    const catGroupMatches = newMatches.filter(m => m.category === cat && !!m.group);
    const allGroupFinished = catGroupMatches.length > 0 && catGroupMatches.every(m => m.status === 'FINISHED');
    const computedStandings = computeStandingsFromData(newMatches, groups, registrations, cat);

    const isGroupReady = (letter: string) => {
      const gMatches = newMatches.filter(
        m => m.category === cat && m.group?.toLowerCase() === `grup ${letter}`.toLowerCase()
      );
      return (gMatches.length > 0 && gMatches.every(m => m.status === 'FINISHED')) || allGroupFinished;
    };

    const catGroups = groups.filter(g => g.category === cat);
    const allJuara: { teamName: string; institution?: string; logo?: string; points: number; goalDiff: number; goalsFor: number }[] = [];
    const allRunnerUp: { teamName: string; institution?: string; logo?: string; points: number; goalDiff: number; goalsFor: number }[] = [];

    catGroups.forEach(grp => {
      const gKey = `${cat}:::${grp.groupName}`;
      const gStandings = computedStandings[gKey];
      if (gStandings && gStandings.length > 0) {
        if (gStandings[0]) {
          allJuara.push({
            teamName: gStandings[0].teamName,
            institution: gStandings[0].institution,
            logo: gStandings[0].teamLogo,
            points: gStandings[0].points || 0,
            goalDiff: (gStandings[0].goalsFor || 0) - (gStandings[0].goalsAgainst || 0),
            goalsFor: gStandings[0].goalsFor || 0,
          });
        }
        if (gStandings[1]) {
          allRunnerUp.push({
            teamName: gStandings[1].teamName,
            institution: gStandings[1].institution,
            logo: gStandings[1].teamLogo,
            points: gStandings[1].points || 0,
            goalDiff: (gStandings[1].goalsFor || 0) - (gStandings[1].goalsAgainst || 0),
            goalsFor: gStandings[1].goalsFor || 0,
          });
        }
      }
    });

    const sortMini = (a: any, b: any) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff;
      if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
      return a.teamName.localeCompare(b.teamName);
    };
    allJuara.sort(sortMini);
    allRunnerUp.sort(sortMini);

    const modifiedKnockouts: MatchItem[] = [];
    const updatedWithKnockoutWinners = newMatches.map(m => {
      if (m.category === cat && !m.group) {
        let changed = false;
        const newA = { ...m.teamA };
        const newB = { ...m.teamB };

        // 1. Juara / Pemenang Grup A-Z
        const matchWinnerA = m.teamA.name.match(/(?:Juara|Pemenang)\s+Grup\s+([A-Za-z])/i);
        if (matchWinnerA && isGroupReady(matchWinnerA[1].toUpperCase())) {
          const grpLetter = matchWinnerA[1].toUpperCase();
          const grpStanding = computedStandings[`${cat}:::Grup ${grpLetter}`];
          if (grpStanding && grpStanding[0] && newA.name !== grpStanding[0].teamName) {
            newA.name = grpStanding[0].teamName;
            newA.institution = grpStanding[0].institution || newA.institution;
            newA.logo = grpStanding[0].teamLogo || newA.logo;
            changed = true;
          }
        }
        const matchWinnerB = m.teamB.name.match(/(?:Juara|Pemenang)\s+Grup\s+([A-Za-z])/i);
        if (matchWinnerB && isGroupReady(matchWinnerB[1].toUpperCase())) {
          const grpLetter = matchWinnerB[1].toUpperCase();
          const grpStanding = computedStandings[`${cat}:::Grup ${grpLetter}`];
          if (grpStanding && grpStanding[0] && newB.name !== grpStanding[0].teamName) {
            newB.name = grpStanding[0].teamName;
            newB.institution = grpStanding[0].institution || newB.institution;
            newB.logo = grpStanding[0].teamLogo || newB.logo;
            changed = true;
          }
        }

        // 2. Runner-up / Peringkat 2 Grup A-Z
        const matchRunnerA = m.teamA.name.match(/(?:Runner-?up|Peringkat\s+2)\s+Grup\s+([A-Za-z])/i);
        if (matchRunnerA && isGroupReady(matchRunnerA[1].toUpperCase())) {
          const grpLetter = matchRunnerA[1].toUpperCase();
          const grpStanding = computedStandings[`${cat}:::Grup ${grpLetter}`];
          if (grpStanding && grpStanding[1] && newA.name !== grpStanding[1].teamName) {
            newA.name = grpStanding[1].teamName;
            newA.institution = grpStanding[1].institution || newA.institution;
            newA.logo = grpStanding[1].teamLogo || newA.logo;
            changed = true;
          }
        }
        const matchRunnerB = m.teamB.name.match(/(?:Runner-?up|Peringkat\s+2)\s+Grup\s+([A-Za-z])/i);
        if (matchRunnerB && isGroupReady(matchRunnerB[1].toUpperCase())) {
          const grpLetter = matchRunnerB[1].toUpperCase();
          const grpStanding = computedStandings[`${cat}:::Grup ${grpLetter}`];
          if (grpStanding && grpStanding[1] && newB.name !== grpStanding[1].teamName) {
            newB.name = grpStanding[1].teamName;
            newB.institution = grpStanding[1].institution || newB.institution;
            newB.logo = grpStanding[1].teamLogo || newB.logo;
            changed = true;
          }
        }

        // 3. Juara Terbaik N (Hanya berlaku bila semua grup dalam kategori sudah selesai)
        const matchBestWinA = m.teamA.name.match(/(?:Juara|Pemenang)\s+Terbaik\s+(\d+)/i);
        if (matchBestWinA && allGroupFinished) {
          const rankIdx = parseInt(matchBestWinA[1], 10) - 1;
          const found = allJuara[rankIdx];
          if (found && newA.name !== found.teamName) {
            newA.name = found.teamName;
            newA.institution = found.institution || newA.institution;
            newA.logo = found.logo || newA.logo;
            changed = true;
          }
        }
        const matchBestWinB = m.teamB.name.match(/(?:Juara|Pemenang)\s+Terbaik\s+(\d+)/i);
        if (matchBestWinB && allGroupFinished) {
          const rankIdx = parseInt(matchBestWinB[1], 10) - 1;
          const found = allJuara[rankIdx];
          if (found && newB.name !== found.teamName) {
            newB.name = found.teamName;
            newB.institution = found.institution || newB.institution;
            newB.logo = found.logo || newB.logo;
            changed = true;
          }
        }

        // 4. Runner-up Terbaik N (Hanya berlaku bila semua grup dalam kategori sudah selesai)
        const matchBestRunA = m.teamA.name.match(/(?:Runner-?up|Peringkat\s+2)\s+Terbaik\s+(\d+)/i);
        if (matchBestRunA && allGroupFinished) {
          const rankIdx = parseInt(matchBestRunA[1], 10) - 1;
          const found = allRunnerUp[rankIdx];
          if (found && newA.name !== found.teamName) {
            newA.name = found.teamName;
            newA.institution = found.institution || newA.institution;
            newA.logo = found.logo || newA.logo;
            changed = true;
          }
        }
        const matchBestRunB = m.teamB.name.match(/(?:Runner-?up|Peringkat\s+2)\s+Terbaik\s+(\d+)/i);
        if (matchBestRunB && allGroupFinished) {
          const rankIdx = parseInt(matchBestRunB[1], 10) - 1;
          const found = allRunnerUp[rankIdx];
          if (found && newB.name !== found.teamName) {
            newB.name = found.teamName;
            newB.institution = found.institution || newB.institution;
            newB.logo = found.logo || newB.logo;
            changed = true;
          }
        }

        if (changed) {
          const mod = { ...m, teamA: newA, teamB: newB };
          modifiedKnockouts.push(mod);
          return mod;
        }
      }
      return m;
    });

    if (modifiedKnockouts.length > 0) {
      setMatches(updatedWithKnockoutWinners);
      safeLocalStorageSet('wabupcup_matches', JSON.stringify(updatedWithKnockoutWinners));
      // Save in a single batch request to minimize RU & FOT
      ApiService.saveMatchesBatch(modifiedKnockouts).catch(() => {});
    }
  };

  // Sponsors
  const [sponsors, setSponsors] = useState<SponsorItem[]>(() => {
    const cached = safeLocalStorageGet<SponsorItem[]>('wabupcup_sponsors', []);
    return filterOutMockSponsors(cached);
  });

  useEffect(() => {
    safeLocalStorageSet('wabupcup_sponsors', JSON.stringify(sponsors));
  }, [sponsors]);

  const addSponsor = (sponsor: Omit<SponsorItem, 'id'>) => {
    const item: SponsorItem = {
      ...sponsor,
      id: `sp-${Date.now()}`,
    };
    setSponsors(prev => [...prev, item]);
    ApiService.saveSponsor(item).catch(err =>
      console.warn('Could not save sponsor to backend:', err)
    );
  };

  const updateSponsor = (updated: SponsorItem) => {
    setSponsors(prev => prev.map(s => (s.id === updated.id ? updated : s)));
    ApiService.saveSponsor(updated).catch(err =>
      console.warn('Could not update sponsor on backend:', err)
    );
  };

  const deleteSponsor = (id: string) => {
    setSponsors(prev => prev.filter(s => s.id !== id));
    ApiService.deleteSponsor(id).catch(err =>
      console.warn('Could not delete sponsor on backend:', err)
    );
  };

  // Admin Users & Auth
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>(() => {
    return safeLocalStorageGet<AdminUser[]>('wabupcup_admins', DEFAULT_ADMIN_USERS);
  });

  const [currentAdmin, setCurrentAdmin] = useState<AdminUser | null>(() => {
    return safeLocalStorageGet<AdminUser | null>('wabupcup_current_admin', null);
  });

  const loginAdmin = async (username: string, pass: string): Promise<{ success: boolean; message?: string; admin?: AdminUser }> => {
    const cleanUser = (username || '').trim().toLowerCase();
    const targetUser = cleanUser === 'admin' ? 'superadmin' : cleanUser;
    if (!cleanUser || !pass) {
      return { success: false, message: 'Username dan kata sandi wajib diisi.' };
    }

    // Strictly authenticate with backend real database
    try {
      const res = await ApiService.loginAdmin(cleanUser, pass);
      if (res && res.success && res.user) {
        setCurrentAdmin(res.user);
        safeLocalStorageSet('wabupcup_current_admin', JSON.stringify(res.user));
        await refreshDataFromServer();
        return { success: true, admin: res.user };
      }
      return {
        success: false,
        message: res?.message || 'Username atau password salah! Harap gunakan akun yang terdaftar di database.',
      };
    } catch (err: any) {
      return {
        success: false,
        message: err?.message || 'Gagal menghubungi server untuk memverifikasi akun.',
      };
    }
  };

  const logoutAdmin = () => {
    setCurrentAdmin(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('wabupcup_current_admin');
      localStorage.removeItem('wabupcup_admin_token');
      fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    }
  };

  const addAdminUser = async (user: Omit<AdminUser, 'id' | 'createdAt'> & { password?: string }): Promise<{ success: boolean; savedToDatabase?: boolean; error?: string }> => {
    const newUser: AdminUser = {
      ...user,
      id: `adm-${Date.now()}`,
      createdAt: new Date().toISOString().split('T')[0],
    };
    setAdminUsers(prev => {
      const next = [...prev, newUser];
      safeLocalStorageSet('wabupcup_admins', JSON.stringify(next));
      return next;
    });

    try {
      const res = await ApiService.createAdmin(user);
      if (!res.success) {
        throw new Error(res.error || 'Gagal menyimpan admin ke database.');
      }
      await checkDbStatus();
      return { success: true, savedToDatabase: res.savedToDatabase };
    } catch (err: any) {
      console.warn('Could not sync created admin to backend:', err);
      ApiService.getAdmins(true).then(fresh => {
        if (fresh && Array.isArray(fresh)) {
          setAdminUsers(fresh);
          safeLocalStorageSet('wabupcup_admins', JSON.stringify(fresh));
        }
      }).catch(() => {});
      return { success: false, error: err?.message || 'Gagal membuat admin' };
    }
  };

  const updateAdminUser = async (updatedUser: AdminUser & { password?: string }): Promise<{ success: boolean; savedToDatabase?: boolean; error?: string }> => {
    setAdminUsers(prev => {
      const next = prev.map(a => (a.id === updatedUser.id ? { ...a, ...updatedUser } : a));
      safeLocalStorageSet('wabupcup_admins', JSON.stringify(next));
      return next;
    });
    if (currentAdmin && currentAdmin.id === updatedUser.id) {
      setCurrentAdmin(updatedUser);
      safeLocalStorageSet('wabupcup_current_admin', JSON.stringify(updatedUser));
    }

    try {
      const res = await ApiService.updateAdmin(updatedUser.id, updatedUser);
      if (!res.success) {
        throw new Error(res.error || 'Gagal menyimpan perubahan admin ke database.');
      }
      await checkDbStatus();
      return { success: true, savedToDatabase: res.savedToDatabase };
    } catch (err: any) {
      console.warn('Could not sync updated admin to backend:', err);
      ApiService.getAdmins(true).then(fresh => {
        if (fresh && Array.isArray(fresh)) {
          setAdminUsers(fresh);
          safeLocalStorageSet('wabupcup_admins', JSON.stringify(fresh));
        }
      }).catch(() => {});
      return { success: false, error: err?.message || 'Gagal mengupdate admin' };
    }
  };

  const deleteAdminUser = async (id: string): Promise<{ success: boolean; savedToDatabase?: boolean; error?: string }> => {
    setAdminUsers(prev => {
      const next = prev.filter(a => a.id !== id);
      safeLocalStorageSet('wabupcup_admins', JSON.stringify(next));
      return next;
    });

    try {
      const res = await ApiService.deleteAdmin(id);
      if (!res.success) {
        throw new Error(res.error || 'Gagal menghapus admin dari database.');
      }
      await checkDbStatus();
      return { success: true, savedToDatabase: res.savedToDatabase };
    } catch (err: any) {
      console.warn('Could not delete admin from backend:', err);
      ApiService.getAdmins(true).then(fresh => {
        if (fresh && Array.isArray(fresh)) {
          setAdminUsers(fresh);
          safeLocalStorageSet('wabupcup_admins', JSON.stringify(fresh));
        }
      }).catch(() => {});
      return { success: false, error: err?.message || 'Gagal menghapus admin' };
    }
  };

  const resetAllDataToDefaults = () => {
    setConfig(DEFAULT_TOURNAMENT_CONFIG);
    setCategories(DEFAULT_CATEGORIES);
    setRegistrations([]);
    setMatches([]);
    setSponsors([]);
    setAdminUsers(DEFAULT_ADMIN_USERS);
    localStorage.clear();
  };

  // WhatsApp formatted notification generator
  const getWhatsAppNotificationUrl = (
    item: RegistrationItem,
    type: 'CONFIRMATION' | 'APPROVED' | 'REJECTED' | 'PAYMENT_REMINDER'
  ): string => {
    const cleanPhone = item.coachPhone.replace(/\D/g, '');
    const phoneWithCountry = cleanPhone.startsWith('0')
      ? `62${cleanPhone.slice(1)}`
      : cleanPhone;

    const primaryBank = bankAccounts.find(b => b.isPrimary) || bankAccounts[0] || config.bankAccount;
    const tourneyName = config.name || 'WabupCup 2026';

    let message = '';
    if (type === 'CONFIRMATION') {
      message = `Halo *${item.coachName}*, terima kasih telah mendaftarkan tim *${item.teamName}* pada Turnamen *${tourneyName}* (Kategori: *${item.category}*).\n\n📌 *Kode Registrasi:* ${item.regCode}\n💰 *Biaya Pendaftaran:* Rp ${item.paymentAmount.toLocaleString('id-ID')}\n🏦 *Transfer ke:* ${primaryBank.bankName} No. Rek: ${primaryBank.accountNumber} a/n ${primaryBank.accountHolder}\n\nSilakan kirimkan bukti transfer ke nomor ini untuk diverifikasi oleh panitia. Salam olahraga!`;
    } else if (type === 'APPROVED') {
      message = `🎉 *SELAMAT! PENDAFTARAN DISETUJUI*\n\nTim *${item.teamName}* (${item.regCode}) telah resmi TERVERIFIKASI & DISETUJUI untuk bertanding di *${tourneyName}* Kategori *${item.category}*.\n\n📅 *PENGUMUMAN:* : Pantau IG @infinity.organizer_.\n🏟️ *Lokasi:* ${config.venueName}, ${config.venueCity}\n\nSampai jumpa di lapangan dan junjung tinggi sportivitas!`;
    } else if (type === 'REJECTED') {
      message = `⚠️ *PEMBERITAHUAN VERIFIKASI BERKAS ${tourneyName.toUpperCase()}*\n\nTim *${item.teamName}* (${item.regCode}), berkas pendaftaran Anda memerlukan perbaikan dengan catatan:\n\n❌ *Alasan:* ${item.rejectionReason || 'Berkas dokumen belum sesuai ketentuan regulasi'}\n\nSilakan lakukan upload ulang atau hubungi sekretariat panitia untuk bantuan perbaikan berkas.`;
    } else if (type === 'PAYMENT_REMINDER') {
      message = `🔔 *PENGINGAT PEMBAYARAN REGISTRASI ${tourneyName.toUpperCase()}*\n\nYth. *${item.coachName}* (${item.teamName}), berkas tim Anda sudah lengkap dan valid. Mohon segera menyelesaikan pembayaran biaya pendaftaran sebesar *Rp ${item.paymentAmount.toLocaleString('id-ID')}* sebelum batas akhir agar slot tim Anda terkunci aman.\n\nRekening: ${primaryBank?.bankName || 'Bank'} ${primaryBank?.accountNumber || '-'} a/n ${primaryBank?.accountHolder || 'Panitia'}. Terima kasih!`;
    } else if (type === 'INVOICE') {
      const invNumber = `INV/WBC26/${item.category}/${item.regCode}`;
      message = `🧾 *INVOICE & KUITANSI RESMI PEMBAYARAN ${tourneyName.toUpperCase()}*\n--------------------------------------------------\nKepada Yth. *${item.coachName}*\nPelatih / Official Tim *${item.teamName}*\n\nTerima kasih, pembayaran pendaftaran tim Anda telah berstatus *LUNAS (PAID)* & terverifikasi oleh Panitia Pelaksana.\n\n📋 *RINCIAN KEPESERTAAN:* \n• Nomor Invoice: *${invNumber}*\n• Kode Registrasi: *${item.regCode}*\n• Kategori: *${item.category}*\n• Asal Instansi: *${item.institutionName || '-'}*\n• Total Biaya: *Rp ${item.paymentAmount.toLocaleString('id-ID')} (LUNAS)*.\n\nSampai jumpa di sesi Technical Meeting & Screening Pemain! Salam olahraga! ⚽🏆`;
    }

    return `https://wa.me/${phoneWithCountry}?text=${encodeURIComponent(message)}`;
  };

  return (
    <TournamentContext.Provider
      value={{
        theme,
        toggleTheme,
        config,
        updateConfig,
        refreshConfig,
        refreshDataFromServer,
        isSyncingWithServer,
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
        categories,
        addCategory,
        updateCategory,
        deleteCategory,
        reorderCategories,
        syncCategoryQuotas,
        refreshCategoryQuotas,
        registrations,
        submitNewRegistration,
        updateRegistration,
        updateRegistrationStatus,
        updatePaymentStatus,
        deleteRegistration,
        matches,
        addMatch,
        updateMatch,
        deleteMatch,
        refreshMatches,
        randomizeMatchesForCategory,
        checkCanDrawNextRound,
        groups,
        saveGroupStagesForCategory,
        randomizeGroupStage,
        generateMatchesFromGroups,
        moveTeamBetweenGroups,
        addTeamToGroup,
        removeTeamFromGroup,
        addGroup,
        deleteGroup,
        resetCategoryGroupsAndMatches,
        syncKnockoutFromStandings,
        players,
        refreshPlayers,
        savePlayer,
        batchImportPlayers,
        deletePlayer,
        standings,
        refreshStandings,
        updateMatchLiveScore,
        sponsors,
        addSponsor,
        updateSponsor,
        deleteSponsor,
        adminUsers,
        currentAdmin,
        loginAdmin,
        logoutAdmin,
        addAdminUser,
        updateAdminUser,
        deleteAdminUser,
        resetAllDataToDefaults,
        getWhatsAppNotificationUrl,
        dbStatus,
        checkDbStatus,
        isInitialLoading,
        isLoadingCategories: isInitialLoading && categories.length === 0,
      }}
    >
      {children}
    </TournamentContext.Provider>
  );
};

export const useTournament = (): TournamentContextType => {
  const context = useContext(TournamentContext);
  if (!context) {
    throw new Error('useTournament must be used within a TournamentProvider');
  }
  return context;
};
