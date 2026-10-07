/**
 * Passerelles de paiement réglables dans le Super Admin (aucun secret ici :
 * uniquement la description des champs à remplir).
 */
export type GatewayField = { key: string; label: string; hint?: string; placeholder?: string; required?: boolean };
export type GatewayDefinition = {
  code: string;
  name: string;
  description: string;
  where: string;
  publicFields: GatewayField[];
  secretFields: GatewayField[];
  /** Adresse de notification à copier dans le tableau de bord du fournisseur. */
  webhook: boolean;
  testNote: string;
};

export const GATEWAYS: GatewayDefinition[] = [
  {
    code: "paydunya",
    name: "PayDunya",
    description: "Mobile Money (Orange, MTN, Moov, Wave…) et cartes en Afrique de l'Ouest.",
    where: "PayDunya › Intégrez nos API › Configurer une application : clé principale, clé privée et token.",
    publicFields: [],
    secretFields: [
      { key: "master_key", label: "Clé principale (Master Key)", required: true },
      { key: "private_key", label: "Clé privée", hint: "test_private_… ou live_private_…", required: true },
      { key: "token", label: "Token", required: true },
    ],
    webhook: true,
    testNote: "Mode test : utilise le « sandbox » PayDunya et des clés de test.",
  },
  {
    code: "cinetpay",
    name: "CinetPay",
    description: "Mobile Money et cartes en Afrique de l'Ouest et centrale.",
    where: "CinetPay › Intégration : identifiant du site (site_id) et clé API (apikey).",
    publicFields: [{ key: "site_id", label: "Identifiant du site (site_id)", required: true, placeholder: "123456" }],
    secretFields: [{ key: "api_key", label: "Clé API (apikey)", required: true }],
    webhook: true,
    testNote: "CinetPay n'a pas d'environnement de test séparé : faites un petit paiement réel pour vérifier.",
  },
  {
    code: "fedapay",
    name: "FedaPay",
    description: "Mobile Money et cartes (Bénin, Togo, Côte d'Ivoire, Sénégal, Niger…).",
    where: "FedaPay › Paramètres › Clés API : clé secrète (sk_sandbox_… en test, sk_live_… en réel).",
    publicFields: [],
    secretFields: [{ key: "secret_key", label: "Clé secrète", hint: "sk_sandbox_… ou sk_live_…", required: true }],
    webhook: true,
    testNote: "Mode test : environnement « sandbox » FedaPay.",
  },
  {
    code: "feexpay",
    name: "FeexPay",
    description: "Mobile Money au Bénin (MTN, Moov, Celtiis), en Côte d'Ivoire, au Togo, au Sénégal, au Burkina Faso et au Congo. Le payeur choisit son réseau et valide sur son téléphone.",
    where: "FeexPay › votre boutique › Développeurs / API : identifiant de la boutique (Shop ID) et clé API (fp_…). Collez aussi l'adresse de notification ci-dessous dans FeexPay (URL de callback).",
    publicFields: [{ key: "shop_id", label: "Identifiant de la boutique (Shop ID)", required: true }],
    secretFields: [{ key: "api_key", label: "Clé API", hint: "fp_…", required: true }],
    webhook: true,
    testNote: "FeexPay n'a pas d'environnement de test : chaque paiement est réel. Vérifiez avec un petit paiement (100 F).",
  },
  {
    code: "flutterwave",
    name: "Flutterwave",
    description: "Cartes, Mobile Money et virements dans de nombreux pays africains.",
    where: "Flutterwave › Settings › API Keys : clé secrète (FLWSECK_TEST… en test).",
    publicFields: [],
    secretFields: [{ key: "secret_key", label: "Clé secrète", hint: "FLWSECK_TEST-… ou FLWSECK-…", required: true }],
    webhook: true,
    testNote: "Le mode (test ou réel) dépend de la clé saisie.",
  },
  {
    code: "paystack",
    name: "Paystack",
    description: "Cartes et Mobile Money (Nigeria, Ghana, Côte d'Ivoire, Afrique du Sud, Kenya).",
    where: "Paystack › Settings › API Keys & Webhooks : clé secrète.",
    publicFields: [],
    secretFields: [{ key: "secret_key", label: "Clé secrète", hint: "sk_test_… ou sk_live_…", required: true }],
    webhook: true,
    testNote: "Le mode (test ou réel) dépend de la clé saisie.",
  },
  {
    code: "stripe",
    name: "Stripe",
    description: "Cartes bancaires internationales (Visa, Mastercard…).",
    where: "Stripe › Développeurs › Clés API : clé secrète.",
    publicFields: [],
    secretFields: [{ key: "secret_key", label: "Clé secrète", hint: "sk_test_… ou sk_live_…", required: true }],
    webhook: true,
    testNote: "Le mode (test ou réel) dépend de la clé saisie.",
  },
  {
    code: "wave",
    name: "Wave",
    description: "Paiement Wave (Sénégal, Côte d'Ivoire…) via Wave Business.",
    where: "Wave Business › Développeurs › Clés API (droit « Checkout »).",
    publicFields: [],
    secretFields: [{ key: "api_key", label: "Clé API Wave", required: true }],
    webhook: true,
    testNote: "Wave n'a pas d'environnement de test : faites un petit paiement réel pour vérifier.",
  },
  {
    code: "offline",
    name: "Paiement par transfert",
    description: "Pour tout autre moyen : numéro Mobile Money, compte bancaire ou lien de paiement de n'importe quel fournisseur. Le client déclare sa référence, vous validez dans Paiements.",
    where: "Aucune clé : écrivez simplement les instructions affichées au client.",
    publicFields: [],
    secretFields: [],
    webhook: false,
    testNote: "Aucune activation automatique : chaque paiement attend votre validation.",
  },
];

export const gatewayDefinition = (code: string) => GATEWAYS.find((g) => g.code === code);
