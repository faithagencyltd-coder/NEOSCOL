import { Bar, C, Card, Check, Frame, Person, Qr, type IllustrationProps } from "./kit";

/**
 * Bibliothèque d'illustrations NEOSCOOL (même style, voir kit.tsx). Chaque scène
 * explique une fonction du produit ; elles complètent les photos réelles.
 */

/** Présence : badge QR présenté à la tablette, arrivée validée. */
export function AttendanceIllustration(props: IllustrationProps) {
  return (
    <Frame {...props}>
      <Card x={70} y={46} w={130} h={150} r={16}>
        <rect x={80} y={58} width={110} height={112} rx={10} fill={C.navyDeep} />
        <Qr x={112} y={84} s={46} />
        <rect x={86} y={80} width={98} height={3} rx={1.5} fill={C.sky} className="ill-beam" />
        <Bar x={104} y={180} w={62} h={6} fill={C.line} />
      </Card>
      <g className="ill-float">
        <Card x={170} y={58} w={84} h={50} r={10}>
          <Check cx={188} cy={83} r={10} />
          <Bar x={204} y={75} w={40} h={6} fill={C.navy} />
          <Bar x={204} y={88} w={30} h={5} />
        </Card>
      </g>
      <Person x={252} y={150} s={1} skin={C.skin[2]} hair="braids" />
      <g className="ill-float-slow">
        <rect x={204} y={168} width={36} height={24} rx={5} fill={C.blue} transform="rotate(-10 222 180)" />
        <rect x={209} y={173} width={13} height={13} rx={2} fill="#fff" transform="rotate(-10 222 180)" />
        <rect x={225} y={175} width={10} height={3} rx={1.5} fill="#fff" opacity="0.8" transform="rotate(-10 222 180)" />
      </g>
    </Frame>
  );
}

/** Notes et bulletins : relevé avec moyennes et graphique. */
export function GradesIllustration(props: IllustrationProps) {
  return (
    <Frame {...props}>
      <Card x={62} y={40} w={150} h={170} r={14}>
        <rect x={62} y={40} width={150} height={34} rx={14} fill={C.navy} />
        <rect x={62} y={60} width={150} height={14} fill={C.navy} />
        <Bar x={76} y={52} w={70} h={7} fill="#fff" />
        {[0, 1, 2, 3].map((i) => (
          <g key={i}>
            <Bar x={76} y={90 + i * 24} w={64} h={6} />
            <rect x={154} y={86 + i * 24} width={42} height={14} rx={7} fill={i === 2 ? "#fef3c7" : "#dcfce7"} />
            <Bar x={162} y={90 + i * 24} w={26} h={6} fill={i === 2 ? C.amber : C.green} />
          </g>
        ))}
      </Card>
      <g className="ill-float">
        <Card x={186} y={120} w={86} h={76} r={12}>
          {[18, 30, 22, 40].map((hgt, i) => (
            <rect key={i} x={200 + i * 16} y={184 - hgt} width={10} height={hgt} rx={3} fill={i === 3 ? C.blue : C.skySoft} className="ill-bar" style={{ animationDelay: `${i * 120}ms` }} />
          ))}
        </Card>
      </g>
      <path d="M226 64l6 12 13 2-9 9 2 13-12-6-12 6 2-13-9-9 13-2z" fill={C.amber} className="ill-pulse" />
    </Frame>
  );
}

/** Paiements : Mobile Money sur téléphone, reçu validé. */
export function PaymentsIllustration(props: IllustrationProps) {
  return (
    <Frame {...props}>
      <rect x={104} y={34} width={92} height={176} rx={18} fill={C.navyDeep} />
      <rect x={110} y={44} width={80} height={156} rx={12} fill="#fff" />
      <Bar x={122} y={58} w={40} h={6} fill={C.navy} />
      <rect x={120} y={74} width={60} height={34} rx={8} fill={C.bg} />
      <Bar x={128} y={84} w={44} h={8} fill={C.blue} />
      <Bar x={128} y={97} w={26} h={5} />
      <rect x={120} y={150} width={60} height={20} rx={10} fill={C.blue} />
      <Bar x={134} y={157} w={32} h={6} fill="#fff" />
      <g className="ill-float">
        <Card x={186} y={78} w={80} h={96} r={10}>
          <Bar x={198} y={92} w={40} h={6} fill={C.navy} />
          <Bar x={198} y={106} w={56} h={5} />
          <Bar x={198} y={118} w={48} h={5} />
          <path d="M194 136h64" stroke={C.line} strokeDasharray="4 4" />
          <Check cx={226} cy={154} r={11} />
        </Card>
      </g>
      <g className="ill-float-slow">
        <circle cx={78} cy={150} r={20} fill={C.amber} />
        <circle cx={78} cy={150} r={14} fill="#fcd34d" />
        <text x={78} y={155} textAnchor="middle" fontSize="14" fontWeight="700" fill="#92400e">F</text>
        <circle cx={92} cy={118} r={13} fill={C.amber} opacity="0.85" />
      </g>
    </Frame>
  );
}

/** Communication : SMS, WhatsApp et notifications vers les familles. */
export function CommunicationIllustration(props: IllustrationProps) {
  return (
    <Frame {...props}>
      <rect x={118} y={40} width={84} height={164} rx={18} fill={C.navyDeep} />
      <rect x={124} y={50} width={72} height={144} rx={12} fill="#fff" />
      <g className="ill-pop" style={{ animationDelay: "0ms" }}>
        <rect x={132} y={64} width={50} height={22} rx={10} fill={C.bg} />
        <Bar x={139} y={72} w={34} h={5} />
      </g>
      <g className="ill-pop" style={{ animationDelay: "300ms" }}>
        <rect x={140} y={94} width={48} height={22} rx={10} fill={C.blue} />
        <Bar x={147} y={102} w={32} h={5} fill="#fff" />
      </g>
      <g className="ill-pop" style={{ animationDelay: "600ms" }}>
        <rect x={132} y={124} width={54} height={22} rx={10} fill={C.bg} />
        <Bar x={139} y={132} w={38} h={5} />
      </g>
      <g className="ill-float">
        <Card x={54} y={88} w={70} h={46} r={12}>
          <circle cx={72} cy={111} r={10} fill={C.green} />
          <path d="M67 111l4 4 7-8" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
          <Bar x={86} y={104} w={28} h={5} fill={C.navy} />
          <Bar x={86} y={115} w={20} h={4} />
        </Card>
      </g>
      <g className="ill-float-slow">
        <Card x={206} y={60} w={64} h={60} r={14}>
          <path d="M238 76c-8 0-12 6-12 13v7l-4 6h32l-4-6v-7c0-7-4-13-12-13z" fill={C.amber} />
          <circle cx={238} cy={106} r={4} fill={C.amber} />
          <circle cx={252} cy={74} r={6} fill={C.red} className="ill-pulse" />
        </Card>
      </g>
      <Person x={236} y={176} s={0.7} skin={C.skin[1]} hair="short" outfit="parent" />
    </Frame>
  );
}

/** Assistant IA : questions en langage naturel, réponses tirées des données. */
export function AssistantIllustration(props: IllustrationProps) {
  return (
    <Frame {...props}>
      <g className="ill-float-slow">
        <circle cx={160} cy={104} r={40} fill={C.navy} />
        <circle cx={160} cy={104} r={40} fill="url(#ill-ai-glow)" />
        <path d="M160 82l5 13 13 5-13 5-5 13-5-13-13-5 13-5z" fill="#fff" />
        <path d="M181 80l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill={C.sky} />
      </g>
      <defs>
        <radialGradient id="ill-ai-glow" cx="0.3" cy="0.3" r="0.9">
          <stop offset="0" stopColor={C.blue} />
          <stop offset="1" stopColor={C.navy} stopOpacity="0" />
        </radialGradient>
      </defs>
      {[
        [96, 70],
        [226, 66],
        [88, 150],
        [236, 146],
      ].map(([x, y], i) => (
        <g key={i}>
          <path d={`M160 104L${x} ${y}`} stroke={C.sky} strokeWidth="2" strokeDasharray="3 5" opacity="0.7" className="ill-dash" />
          <circle cx={x} cy={y} r={9} fill="#fff" stroke={C.sky} strokeWidth="2" className="ill-pulse" style={{ animationDelay: `${i * 250}ms` }} />
        </g>
      ))}
      <Card x={70} y={168} w={126} h={38} r={12}>
        <Bar x={84} y={180} w={80} h={6} fill={C.navy} />
        <Bar x={84} y={192} w={56} h={5} />
      </Card>
      <g className="ill-float">
        <Card x={178} y={176} w={92} h={34} r={12}>
          <rect x={178} y={176} width={92} height={34} rx={12} fill={C.blue} />
          <Bar x={190} y={188} w={58} h={6} fill="#fff" />
        </Card>
      </g>
    </Frame>
  );
}

/** Sécurité : données chiffrées, accès par rôle, journal d'audit. */
export function SecurityIllustration(props: IllustrationProps) {
  return (
    <Frame {...props}>
      <path d="M160 40l62 22v44c0 42-28 70-62 84-34-14-62-42-62-84V62z" fill={C.navy} />
      <path d="M160 54l48 17v35c0 33-21 55-48 67-27-12-48-34-48-67V71z" fill={C.blue} opacity="0.9" />
      <rect x={140} y={106} width={40} height={32} rx={7} fill="#fff" />
      <path d="M148 106v-9a12 12 0 0124 0v9" fill="none" stroke="#fff" strokeWidth="5" />
      <circle cx={160} cy={120} r={4} fill={C.navy} />
      <rect x={158} y={122} width={4} height={8} rx={2} fill={C.navy} />
      <g className="ill-float">
        <Card x={214} y={126} w={66} h={70} r={10}>
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <circle cx={228} cy={144 + i * 17} r={4} fill={i === 2 ? C.amber : C.green} />
              <Bar x={237} y={141 + i * 17} w={34} h={5} />
            </g>
          ))}
        </Card>
      </g>
      <g className="ill-float-slow">
        <Card x={42} y={120} w={60} h={50} r={10}>
          <circle cx={72} cy={140} r={9} fill={C.bg} />
          <path d="M66 140a6 6 0 0112 0M64 146a9 9 0 0116 0" stroke={C.blue} strokeWidth="2" fill="none" />
          <Bar x={56} y={156} w={32} h={5} />
        </Card>
      </g>
    </Frame>
  );
}

/** Documents officiels : bulletin, attestation, cachet et QR de vérification. */
export function DocumentsIllustration(props: IllustrationProps) {
  return (
    <Frame {...props}>
      <g transform="rotate(-8 130 120)">
        <Card x={74} y={52} w={112} h={144} r={10} />
      </g>
      <Card x={102} y={42} w={120} h={158} r={10}>
        <rect x={102} y={42} width={120} height={8} rx={4} fill={C.blue} />
        <Bar x={116} y={62} w={60} h={7} fill={C.navy} />
        <Bar x={116} y={78} w={92} h={5} />
        <Bar x={116} y={90} w={84} h={5} />
        <Bar x={116} y={102} w={88} h={5} />
        <Bar x={116} y={114} w={60} h={5} />
        <Qr x={116} y={148} s={34} />
        <circle cx={190} cy={168} r={18} fill="none" stroke={C.red} strokeWidth="3" opacity="0.75" />
        <circle cx={190} cy={168} r={11} fill="none" stroke={C.red} strokeWidth="2" opacity="0.6" />
      </Card>
      <g className="ill-float">
        <Card x={214} y={84} w={62} h={48} r={12}>
          <Check cx={234} cy={108} r={11} />
          <Bar x={250} y={102} w={18} h={5} fill={C.navy} />
          <Bar x={250} y={112} w={14} h={4} />
        </Card>
      </g>
    </Frame>
  );
}

/** Statistiques : tableau de bord de la direction. */
export function StatsIllustration(props: IllustrationProps) {
  return (
    <Frame {...props}>
      <Card x={56} y={52} w={208} h={140} r={14}>
        <Bar x={72} y={68} w={70} h={7} fill={C.navy} />
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <rect x={72 + i * 62} y={86} width={54} height={34} rx={8} fill={C.bg} />
            <Bar x={80 + i * 62} y={96} w={30} h={7} fill={[C.blue, C.green, C.amber][i]} />
            <Bar x={80 + i * 62} y={108} w={20} h={4} />
          </g>
        ))}
        <path d="M74 176c20-6 30-20 50-16s28 12 48-4 30-18 76-22" fill="none" stroke={C.blue} strokeWidth="3.5" strokeLinecap="round" className="ill-draw" />
        <path d="M74 176c20-6 30-20 50-16s28 12 48-4 30-18 76-22V184H74z" fill={C.sky} opacity="0.15" />
      </Card>
      <g className="ill-float">
        <circle cx={262} cy={70} r={24} fill="#fff" />
        <circle cx={262} cy={70} r={16} fill="none" stroke={C.line} strokeWidth="7" />
        <circle cx={262} cy={70} r={16} fill="none" stroke={C.green} strokeWidth="7" strokeDasharray="70 101" transform="rotate(-90 262 70)" strokeLinecap="round" />
      </g>
    </Frame>
  );
}

/** Automatisation : une action déclenche relances, reçus et accès sans ressaisie. */
export function AutomationIllustration(props: IllustrationProps) {
  return (
    <Frame {...props}>
      <Card x={52} y={96} w={70} h={52} r={12}>
        <circle cx={70} cy={122} r={9} fill={C.blue} />
        <Bar x={84} y={117} w={28} h={5} fill={C.navy} />
        <Bar x={84} y={127} w={20} h={4} />
      </Card>
      {[70, 122, 174].map((y, i) => (
        <g key={y}>
          <path d={`M122 122C150 122 150 ${y} 186 ${y}`} fill="none" stroke={C.sky} strokeWidth="2.5" strokeDasharray="5 5" className="ill-dash" />
          <g className="ill-pop" style={{ animationDelay: `${i * 250}ms` }}>
            <Card x={186} y={y - 20} w={82} h={40} r={10}>
              <circle cx={202} cy={y} r={8} fill={[C.green, C.amber, C.blue][i]} />
              <Bar x={216} y={y - 6} w={40} h={5} fill={C.navy} />
              <Bar x={216} y={y + 3} w={28} h={4} />
            </Card>
          </g>
        </g>
      ))}
    </Frame>
  );
}

/** Hors ligne : l'appel continue sans connexion, synchronisé au retour du réseau. */
export function OfflineIllustration(props: IllustrationProps) {
  return (
    <Frame {...props}>
      <path d="M104 120a30 30 0 0156-18 26 26 0 0150 12 22 22 0 01-2 44H112a22 22 0 01-8-38z" fill="#fff" />
      <path d="M126 92l92 80" stroke={C.red} strokeWidth="6" strokeLinecap="round" />
      <g className="ill-spin">
        <path d="M236 70a26 26 0 11-8-12" fill="none" stroke={C.blue} strokeWidth="5" strokeLinecap="round" />
        <path d="M230 50l-1 10 10-1" fill="none" stroke={C.blue} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <g className="ill-float">
        <rect x={52} y={140} width={62} height={80} rx={12} fill={C.navyDeep} />
        <rect x={57} y={148} width={52} height={62} rx={7} fill="#fff" />
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <circle cx={66} cy={160 + i * 16} r={4} fill={i === 1 ? C.amber : C.green} />
            <Bar x={74} y={157 + i * 16} w={28} h={5} />
          </g>
        ))}
      </g>
    </Frame>
  );
}

/** Parents : suivi de l'enfant depuis le téléphone (présences, notes, paiements). */
export function ParentsIllustration(props: IllustrationProps) {
  return (
    <Frame {...props}>
      <Person x={124} y={128} s={1.2} skin={C.skin[1]} hair="bun" outfit="parent" />
      <Person x={180} y={150} s={0.9} skin={C.skin[2]} hair="short" />
      <g className="ill-float">
        <rect x={214} y={70} width={60} height={112} rx={12} fill={C.navyDeep} />
        <rect x={219} y={78} width={50} height={94} rx={7} fill="#fff" />
        <Check cx={234} cy={96} r={7} />
        <Bar x={245} y={93} w={18} h={5} />
        <rect x={226} y={112} width={36} height={16} rx={5} fill={C.bg} />
        <Bar x={231} y={118} w={22} h={4} fill={C.blue} />
        <rect x={226} y={136} width={36} height={16} rx={5} fill="#fef3c7" />
        <Bar x={231} y={142} w={18} h={4} fill={C.amber} />
      </g>
      <path d="M58 72c0-7 6-12 12-12 5 0 9 3 10 7 1-4 5-7 10-7 6 0 12 5 12 12 0 12-22 24-22 24S58 84 58 72z" fill={C.red} opacity="0.8" className="ill-pulse" />
    </Frame>
  );
}

/** Enseignant : cours du jour, appel et saisie des notes. */
export function TeacherIllustration(props: IllustrationProps) {
  return (
    <Frame {...props}>
      <rect x={60} y={48} width={150} height={96} rx={10} fill={C.navy} />
      <rect x={66} y={54} width={138} height={84} rx={6} fill="#123a7a" />
      <path d="M80 118l22-24 18 14 26-32 34 26" fill="none" stroke={C.sky} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="ill-draw" />
      <Bar x={80} y={66} w={54} h={6} fill="#fff" />
      <Person x={228} y={144} s={1.05} skin={C.skin[0]} hair="short" outfit="teacher" />
      <g className="ill-float">
        <Card x={74} y={156} w={118} h={50} r={12}>
          {[0, 1, 2, 3].map((i) => (
            <circle key={i} cx={96 + i * 24} cy={172} r={8} fill={i === 2 ? "#fde68a" : "#bbf7d0"} />
          ))}
          <Bar x={88} y={188} w={80} h={6} />
        </Card>
      </g>
    </Frame>
  );
}

/** Formation professionnelle : atelier, compétences et sessions. */
export function TrainingIllustration(props: IllustrationProps) {
  return (
    <Frame {...props}>
      <rect x={70} y={74} width={120} height={78} rx={8} fill={C.navyDeep} />
      <rect x={76} y={80} width={108} height={66} rx={5} fill="#fff" />
      <path d="M58 152h144l-10 12H68z" fill={C.navy} />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <Bar x={86} y={92 + i * 16} w={40} h={5} />
          <rect x={134} y={90 + i * 16} width={40} height={8} rx={4} fill={C.bg} />
          <rect x={134} y={90 + i * 16} width={[34, 22, 30][i]} height={8} rx={4} fill={[C.green, C.amber, C.blue][i]} className="ill-bar-x" style={{ animationDelay: `${i * 150}ms` }} />
        </g>
      ))}
      <Person x={234} y={150} s={0.95} skin={C.skin[3]} hair="short" outfit="apron" />
      <g className="ill-spin" style={{ transformOrigin: "84px 62px" }}>
        <circle cx={84} cy={62} r={14} fill="none" stroke={C.amber} strokeWidth="6" strokeDasharray="6 4.5" />
        <circle cx={84} cy={62} r={6} fill={C.amber} />
      </g>
      <path d="M232 64l12 12m-12 0l12-12" stroke={C.sky} strokeWidth="4" strokeLinecap="round" />
    </Frame>
  );
}

/** Université : campus, crédits et diplôme. */
export function UniversityIllustration(props: IllustrationProps) {
  return (
    <Frame {...props}>
      <path d="M76 96l84-40 84 40z" fill={C.navy} />
      <rect x={82} y={96} width={156} height={10} fill={C.blue} />
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} x={94 + i * 28} y={110} width={12} height={62} rx={3} fill="#fff" />
      ))}
      <rect x={76} y={172} width={168} height={12} rx={3} fill={C.navy} />
      <g className="ill-float">
        <path d="M232 52l30 12-30 12-30-12z" fill={C.navyDeep} />
        <path d="M214 70v12c10 8 26 8 36 0V70l-18 7z" fill={C.navy} />
        <path d="M260 64v18" stroke={C.amber} strokeWidth="3" />
        <circle cx={260} cy={84} r={3.5} fill={C.amber} />
      </g>
      <g className="ill-float-slow">
        <Card x={40} y={120} w={58} h={60} r={10}>
          <Bar x={50} y={132} w={30} h={5} fill={C.navy} />
          <circle cx={69} cy={158} r={13} fill="none" stroke={C.line} strokeWidth="6" />
          <circle cx={69} cy={158} r={13} fill="none" stroke={C.blue} strokeWidth="6" strokeDasharray="60 82" transform="rotate(-90 69 158)" strokeLinecap="round" />
        </Card>
      </g>
    </Frame>
  );
}

/** État vide : rien pour le moment, tout est prêt. */
export function EmptyIllustration(props: IllustrationProps) {
  return (
    <Frame {...props}>
      <path d="M92 118l20-44h96l20 44v62a10 10 0 01-10 10H102a10 10 0 01-10-10z" fill="#fff" />
      <path d="M92 118h44l8 16h32l8-16h44" fill="none" stroke={C.line} strokeWidth="4" strokeLinejoin="round" />
      <g className="ill-float">
        <Card x={122} y={50} w={76} h={52} r={10}>
          <Bar x={134} y={64} w={40} h={6} fill={C.navy} />
          <Bar x={134} y={78} w={52} h={5} />
        </Card>
      </g>
      <path d="M232 70l4 10 10 4-10 4-4 10-4-10-10-4 10-4z" fill={C.amber} className="ill-pulse" />
    </Frame>
  );
}

/** Journal d'audit : chaque action tracée (qui, quoi, quand), consultable et filtrable. */
export function AuditIllustration(props: IllustrationProps) {
  return (
    <Frame {...props}>
      <Card x={70} y={44} w={150} h={160} r={14}>
        <Bar x={86} y={60} w={70} h={7} fill={C.navy} />
        <path d="M96 84v104" stroke={C.line} strokeWidth="3" />
        {[0, 1, 2, 3].map((i) => (
          <g key={i} className="ill-pop" style={{ animationDelay: `${i * 180}ms` }}>
            <circle cx={96} cy={90 + i * 28} r={7} fill={[C.blue, C.green, C.amber, C.sky][i]} />
            <Bar x={110} y={84 + i * 28} w={70} h={5} fill={C.navy} />
            <Bar x={110} y={94 + i * 28} w={48} h={4} />
          </g>
        ))}
      </Card>
      <g className="ill-float">
        <circle cx={228} cy={132} r={30} fill="#fff" stroke={C.blue} strokeWidth="8" />
        <circle cx={228} cy={132} r={16} fill={C.bg} />
        <path d="M249 154l24 24" stroke={C.navy} strokeWidth="12" strokeLinecap="round" />
      </g>
    </Frame>
  );
}

export const ILLUSTRATIONS = {
  attendance: AttendanceIllustration,
  grades: GradesIllustration,
  payments: PaymentsIllustration,
  communication: CommunicationIllustration,
  assistant: AssistantIllustration,
  security: SecurityIllustration,
  audit: AuditIllustration,
  documents: DocumentsIllustration,
  stats: StatsIllustration,
  automation: AutomationIllustration,
  offline: OfflineIllustration,
  parents: ParentsIllustration,
  teacher: TeacherIllustration,
  training: TrainingIllustration,
  university: UniversityIllustration,
  empty: EmptyIllustration,
} as const;
export type IllustrationName = keyof typeof ILLUSTRATIONS;
