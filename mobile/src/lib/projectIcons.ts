import {
  Rocket, Target, Zap, Bug, BarChart2, Calendar,
  BookOpen, Layers, Globe, Shield, Code2, Flame,
  Sparkles, Trophy,
} from 'lucide-react-native';

export interface ProjectIconDef {
  id: string;
  label: string;
  Icon: any;
  gradient: [string, string];
}

export const PROJECT_ICONS: ProjectIconDef[] = [
  { id: 'rocket',   label: 'Rocket',    Icon: Rocket,    gradient: ['#8B5CF6', '#6D28D9'] },
  { id: 'target',   label: 'Target',    Icon: Target,    gradient: ['#F87171', '#DC2626'] },
  { id: 'zap',      label: 'Bolt',      Icon: Zap,       gradient: ['#FBBF24', '#F59E0B'] },
  { id: 'bug',      label: 'Bug',       Icon: Bug,       gradient: ['#4ADE80', '#16A34A'] },
  { id: 'chart',    label: 'Chart',     Icon: BarChart2, gradient: ['#60A5FA', '#2563EB'] },
  { id: 'calendar', label: 'Calendar',  Icon: Calendar,  gradient: ['#2DD4BF', '#0D9488'] },
  { id: 'book',     label: 'Book',      Icon: BookOpen,  gradient: ['#FB923C', '#EA580C'] },
  { id: 'layers',   label: 'Layers',    Icon: Layers,    gradient: ['#F472B6', '#DB2777'] },
  { id: 'globe',    label: 'Globe',     Icon: Globe,     gradient: ['#22D3EE', '#0891B2'] },
  { id: 'shield',   label: 'Shield',    Icon: Shield,    gradient: ['#5B8DEF', '#3457D5'] },
  { id: 'code',     label: 'Code',      Icon: Code2,     gradient: ['#818CF8', '#4F46E5'] },
  { id: 'flame',    label: 'Flame',     Icon: Flame,     gradient: ['#FB7185', '#E11D48'] },
  { id: 'sparkles', label: 'Sparkles',  Icon: Sparkles,  gradient: ['#E879F9', '#C026D3'] },
  { id: 'trophy',   label: 'Trophy',    Icon: Trophy,    gradient: ['#FACC15', '#CA8A04'] },
];

export const PROJECT_ICON_MAP = new Map(PROJECT_ICONS.map(i => [i.id, i]));
