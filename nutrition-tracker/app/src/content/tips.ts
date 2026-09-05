/**
 * The tips library backing Home's "Tips for you" -- a hand-written, curated
 * set (not AI-generated per request: this never touches the Gemini budget,
 * and a model improvising nutrition advice on the fly is a real accuracy
 * risk this app deliberately avoids). Personalization comes from matching
 * each tip's `condition` against real signals computed from someone's
 * actual logs/profile (see selectContent.ts) -- deterministic, not AI.
 */

export type TipCondition =
  | { type: "goal"; value: "lose" | "maintain" | "gain" }
  | { type: "high_sodium" }
  | { type: "low_protein" }
  | { type: "dish"; dishIds: string[] }
  | { type: "no_recent_exercise" }
  | { type: "general" }; // always eligible -- hydration, portion, consistency, general facts

export interface Tip {
  id: string;
  emoji: string;
  title: string;
  body: string;
  condition: TipCondition;
}

export const TIPS: Tip[] = [
  // ---- Goal: lose (6) ----
  {
    id: "lose-protein-first",
    emoji: "🍗",
    title: "Protein first",
    body: "Protein helps you feel full longer on fewer calories -- worth prioritizing at each meal when you're in a deficit.",
    condition: { type: "goal", value: "lose" },
  },
  {
    id: "lose-liquid-calories",
    emoji: "🥤",
    title: "Watch liquid calories",
    body: "A mango shake or sweetened chai can add 200+ kcal without filling you up the way food does.",
    condition: { type: "goal", value: "lose" },
  },
  {
    id: "lose-bulk-with-veg",
    emoji: "🥗",
    title: "Bulk up with vegetables",
    body: "Salad or sauteed vegetables alongside karahi or biryani add real volume to a meal without many calories.",
    condition: { type: "goal", value: "lose" },
  },
  {
    id: "lose-slow-down",
    emoji: "🍽️",
    title: "Slow down",
    body: "Eating quickly makes it easier to overeat before your body's had time to signal it's full.",
    condition: { type: "goal", value: "lose" },
  },
  {
    id: "lose-plan-cravings",
    emoji: "🍪",
    title: "Plan for cravings",
    body: "A small planned portion of what you're craving usually beats fighting it and giving in bigger later.",
    condition: { type: "goal", value: "lose" },
  },
  {
    id: "lose-weigh-weekly",
    emoji: "⚖️",
    title: "Weigh in weekly, not daily",
    body: "Day-to-day weight swings are mostly water, not fat -- the trend over a week tells the real story.",
    condition: { type: "goal", value: "lose" },
  },

  // ---- Goal: maintain (6) ----
  {
    id: "maintain-consistency",
    emoji: "📅",
    title: "Consistency beats perfection",
    body: "Hitting your target most days matters far more than any single \"perfect\" day.",
    condition: { type: "goal", value: "maintain" },
  },
  {
    id: "maintain-recheck-target",
    emoji: "🎯",
    title: "Recheck your target sometimes",
    body: "As your weight or activity level changes, your calorie needs shift too -- worth updating your profile occasionally.",
    condition: { type: "goal", value: "maintain" },
  },
  {
    id: "maintain-protein-steady",
    emoji: "🍗",
    title: "Keep protein steady",
    body: "It's the easiest macro to under-eat once you're not actively trying to lose weight -- worth keeping an eye on.",
    condition: { type: "goal", value: "maintain" },
  },
  {
    id: "maintain-treat-no-guilt",
    emoji: "🍰",
    title: "A treat doesn't need making up for",
    body: "One indulgent meal doesn't undo a week of otherwise good habits -- no need to overcorrect the next day.",
    condition: { type: "goal", value: "maintain" },
  },
  {
    id: "maintain-stay-active",
    emoji: "🚶",
    title: "Stay active, not just on a diet",
    body: "Maintaining weight is as much about staying active as it is about food.",
    condition: { type: "goal", value: "maintain" },
  },
  {
    id: "maintain-revisit-goal",
    emoji: "🔄",
    title: "It's fine to change direction",
    body: "\"Maintain\" today doesn't have to mean \"maintain\" forever -- your goal can change whenever you're ready.",
    condition: { type: "goal", value: "maintain" },
  },

  // ---- Goal: gain (6) ----
  {
    id: "gain-calorie-dense",
    emoji: "🥜",
    title: "Calorie-dense doesn't mean junk",
    body: "Nuts, ghee, dairy, and meat pack real calories without needing huge portions.",
    condition: { type: "goal", value: "gain" },
  },
  {
    id: "gain-dont-skip-meals",
    emoji: "🍽️",
    title: "Don't skip meals",
    body: "It's harder to hit a calorie surplus in fewer, bigger meals than spread across the day.",
    condition: { type: "goal", value: "gain" },
  },
  {
    id: "gain-strength-training",
    emoji: "🏋️",
    title: "Strength training makes the difference",
    body: "A surplus without resistance training tends to add more fat than muscle.",
    condition: { type: "goal", value: "gain" },
  },
  {
    id: "gain-track-anyway",
    emoji: "📝",
    title: "Track even when it feels like a lot",
    body: "A surplus that feels big can still quietly fall short of the target -- worth logging to check.",
    condition: { type: "goal", value: "gain" },
  },
  {
    id: "gain-liquid-calories-work-for-you",
    emoji: "🥤",
    title: "Liquid calories work in your favor here",
    body: "A milk-based lassi or shake is an easy way to add real calories without adding much bulk to a meal.",
    condition: { type: "goal", value: "gain" },
  },
  {
    id: "gain-be-patient",
    emoji: "⏳",
    title: "Be patient",
    body: "A lean gain is slow -- rapid weight gain is mostly fat, not muscle.",
    condition: { type: "goal", value: "gain" },
  },

  // ---- High sodium pattern (6) ----
  {
    id: "sodium-nihari-biryani",
    emoji: "🧂",
    title: "Watch the salt",
    body: "Nihari, biryani, and pickled achar all run high in sodium -- pairing with plain daal or salad helps balance the day out.",
    condition: { type: "high_sodium" },
  },
  {
    id: "sodium-restaurant-vs-home",
    emoji: "🍛",
    title: "Restaurant vs. home-cooked",
    body: "Restaurant karahi and biryani are often saltier than the home-cooked version -- a home-cooked day can help offset a restaurant one.",
    condition: { type: "high_sodium" },
  },
  {
    id: "sodium-extra-water",
    emoji: "💧",
    title: "Extra water helps",
    body: "If today's log leaned on fried snacks or fast food, add extra water -- sodium pulls water out of your cells and can leave you feeling puffy or thirsty.",
    condition: { type: "high_sodium" },
  },
  {
    id: "sodium-chaat-street-food",
    emoji: "🍢",
    title: "Chaat and street food",
    body: "Tasty but sodium-heavy -- fine occasionally, worth balancing the rest of the day around.",
    condition: { type: "high_sodium" },
  },
  {
    id: "sodium-taste-before-adding",
    emoji: "🥄",
    title: "Taste before adding more",
    body: "Salt often gets added while cooking AND at the table -- tasting first can save more than it seems over a week.",
    condition: { type: "high_sodium" },
  },
  {
    id: "sodium-blood-pressure",
    emoji: "❤️",
    title: "It's not just about taste",
    body: "High sodium is linked to blood pressure over time -- worth watching if it's a regular pattern, not just an occasional day.",
    condition: { type: "high_sodium" },
  },

  // ---- Low protein / under target (6) ----
  {
    id: "protein-egg-chickpeas",
    emoji: "🥚",
    title: "Easy protein top-up",
    body: "A boiled egg or a handful of chickpeas is a fast way to close the gap without extra cooking.",
    condition: { type: "low_protein" },
  },
  {
    id: "protein-daal",
    emoji: "🍲",
    title: "Daal is your friend here",
    body: "One of the most accessible protein sources in Pakistani cooking -- a bowl adds real protein for very little cost.",
    condition: { type: "low_protein" },
  },
  {
    id: "protein-breast-vs-thigh",
    emoji: "🍗",
    title: "Breast has more protein per gram",
    body: "A small swap from thigh to chicken breast adds up if protein's the priority today.",
    condition: { type: "low_protein" },
  },
  {
    id: "protein-paneer-yogurt",
    emoji: "🧀",
    title: "Vegetarian protein sources",
    body: "Paneer, yogurt, and lassi are all solid options if you're eating vegetarian today.",
    condition: { type: "low_protein" },
  },
  {
    id: "protein-breakfast",
    emoji: "🍳",
    title: "Protein at breakfast",
    body: "Eggs or yogurt in the morning tend to curb cravings better than a carb-heavy start to the day.",
    condition: { type: "low_protein" },
  },
  {
    id: "protein-before-bed",
    emoji: "🥛",
    title: "Light dinner? Top up before bed",
    body: "A glass of milk or a small bowl of yogurt is an easy way to close a protein gap from earlier in the day.",
    condition: { type: "low_protein" },
  },

  // ---- Dish-specific (15) ----
  {
    id: "dish-karahi-thigh-breast",
    emoji: "🍗",
    title: "Protein swap",
    body: "Swapping chicken thigh for breast in karahi cuts fat while keeping the protein about the same.",
    condition: { type: "dish", dishIds: ["chicken_karahi", "mutton_karahi"] },
  },
  {
    id: "dish-biryani-ratio",
    emoji: "🍚",
    title: "Biryani's rice-to-meat ratio",
    body: "Most of biryani's calories come from the rice, not the meat -- asking for extra raita and a bit less rice lightens it without changing the flavor much.",
    condition: { type: "dish", dishIds: ["chicken_biryani", "prawn_biryani", "sindhi_biryani"] },
  },
  {
    id: "dish-nihari-skim-oil",
    emoji: "🍲",
    title: "Nihari's hidden calories",
    body: "A lot of nihari's calories sit in the layer of oil on top from slow-cooking -- skimming it off before eating cuts a meaningful chunk without changing the taste much.",
    condition: { type: "dish", dishIds: ["beef_nihari", "chicken_nihari"] },
  },
  {
    id: "dish-daal-chawal-balanced",
    emoji: "🍛",
    title: "One of the best everyday meals",
    body: "Daal chawal is naturally balanced -- good protein from the daal, energy from the rice, and lower in fat than most karahi-based dishes.",
    condition: { type: "dish", dishIds: ["daal_chawal_masoor", "chana_daal", "moong_daal", "maash_ki_daal", "kali_daal", "daal_makhani"] },
  },
  {
    id: "dish-roti-vs-naan",
    emoji: "🫓",
    title: "Roti vs naan",
    body: "A plain roti has roughly a third of the calories of a butter naan -- an easy swap that adds up fast if bread's a daily thing.",
    condition: { type: "dish", dishIds: ["roti", "naan", "peshawari_naan"] },
  },
  {
    id: "dish-paratha-oil",
    emoji: "🥞",
    title: "Paratha's calories are mostly the oil",
    body: "A lightly-oiled or dry-fried paratha is a real calorie difference from a deep-fried one -- same bread, very different fat.",
    condition: { type: "dish", dishIds: ["paratha", "desi_ghee_paratha", "lachha_paratha"] },
  },
  {
    id: "dish-samosa-pakora-fried",
    emoji: "🥟",
    title: "Fried snacks add up fast",
    body: "Samosas and pakoras are easy to underestimate -- the oil they absorb while frying adds up more than the filling itself does.",
    condition: { type: "dish", dishIds: ["samosa", "pakora", "kadhi_pakora"] },
  },
  {
    id: "dish-chaat-gol-gappay",
    emoji: "🍢",
    title: "It's the chutneys, not the veg",
    body: "Chaat and gol gappay are usually more about the fried elements and sweet/tangy chutneys than the vegetables in them -- tasty, but easy to underestimate portion for portion.",
    condition: { type: "dish", dishIds: ["gol_gappay", "chana_chaat", "papri_chaat"] },
  },
  {
    id: "dish-kebab-lean",
    emoji: "🍢",
    title: "One of the leaner choices",
    body: "Grilled kebabs are genuinely one of the leaner options in Pakistani cooking -- most of the rendered fat is left on the grill, not in your plate.",
    condition: { type: "dish", dishIds: ["seekh_kebab", "reshmi_kebab", "shami_kebab", "bun_kebab"] },
  },
  {
    id: "dish-chapli-fried",
    emoji: "🍔",
    title: "Chapli kebab is the exception",
    body: "Unlike most kebabs, chapli kebab is fried -- good occasionally, but not a like-for-like swap for a grilled one if fat is what you're watching.",
    condition: { type: "dish", dishIds: ["chapli_kebab"] },
  },
  {
    id: "dish-chai-sugar",
    emoji: "☕",
    title: "Chai's calories are the milk and sugar",
    body: "The tea itself is basically free -- going easy on the sugar (or skipping it) is the single biggest lever on a cup of chai.",
    condition: { type: "dish", dishIds: ["chai_regular", "kashmiri_chai", "karak_chai"] },
  },
  {
    id: "dish-shake-dessert",
    emoji: "🥤",
    title: "More dessert than drink",
    body: "A mango or chocolate shake can run 300-400 kcal between the milk, sugar, and fruit -- a treat, not a top-up drink.",
    condition: {
      type: "dish",
      dishIds: ["mango_shake", "date_milk_shake", "oreo_shake", "chocolate_shake", "strawberry_shake", "banana_shake", "banana_nut_milk_shake"],
    },
  },
  {
    id: "dish-halwa-portion",
    emoji: "🍮",
    title: "A little goes a long way",
    body: "Halwa is dense in sugar and ghee -- a small portion after a meal goes further than it looks, and satisfies the craving just as well.",
    condition: { type: "dish", dishIds: ["sooji_halwa", "gajar_halwa"] },
  },
  {
    id: "dish-pulao-lighter",
    emoji: "🍚",
    title: "Usually lighter than biryani",
    body: "Pulao typically uses less oil and fewer rich spice pastes than biryani -- generally the lighter choice, though portion size still matters most.",
    condition: { type: "dish", dishIds: ["beef_pulao", "chana_pulao", "yakhni_pulao", "matar_pulao", "kabuli_pulao", "kashmiri_pulao"] },
  },
  {
    id: "dish-lassi-sweet-vs-plain",
    emoji: "🥛",
    title: "Sweet lassi is closer to dessert",
    body: "A plain, unsweetened lassi gets you the same protein from the yogurt with a lot less sugar than the sweet version.",
    condition: { type: "dish", dishIds: ["lassi_sweet", "full_cream_nutty_lassi"] },
  },

  // ---- No recent exercise (6) ----
  {
    id: "exercise-short-walk",
    emoji: "🚶",
    title: "Even 15-20 minutes counts",
    body: "You don't need a full workout for it to make a real difference to today's budget.",
    condition: { type: "no_recent_exercise" },
  },
  {
    id: "exercise-housework",
    emoji: "🧹",
    title: "Housework and errands add up",
    body: "A couple of hours of active chores burns more than most people expect -- log it if it was genuinely active.",
    condition: { type: "no_recent_exercise" },
  },
  {
    id: "exercise-restart-small",
    emoji: "🔄",
    title: "A short walk is an easy restart",
    body: "If it's been a few days since you moved, today doesn't need to be a big commitment -- just a short one.",
    condition: { type: "no_recent_exercise" },
  },
  {
    id: "exercise-after-dinner-walk",
    emoji: "🌙",
    title: "The after-dinner walk is a good habit",
    body: "It doesn't have to be structured -- a walk after dinner is a genuinely good one to keep up.",
    condition: { type: "no_recent_exercise" },
  },
  {
    id: "exercise-small-consistent",
    emoji: "📈",
    title: "Small and consistent wins",
    body: "15 minutes most days adds up to more than one long session a week.",
    condition: { type: "no_recent_exercise" },
  },
  {
    id: "exercise-not-making-up",
    emoji: "🚶",
    title: "Not about \"making up for\" food",
    body: "If today felt heavy on food, a short walk isn't undoing anything -- it's just a good idea either way.",
    condition: { type: "no_recent_exercise" },
  },

  // ---- General: hydration (4) ----
  {
    id: "general-thirst-vs-hunger",
    emoji: "💧",
    title: "Thirst can feel like hunger",
    body: "Worth trying a glass of water before a snack, just to check.",
    condition: { type: "general" },
  },
  {
    id: "general-chai-not-water",
    emoji: "🍵",
    title: "Chai doesn't count as water",
    body: "Tea and sugary drinks don't hydrate the same way -- worth having actual water alongside them.",
    condition: { type: "general" },
  },
  {
    id: "general-summer-hydration",
    emoji: "☀️",
    title: "Heat changes your water needs",
    body: "In Pakistan's summer heat, water needs go up -- don't let food tracking crowd out drinking enough.",
    condition: { type: "general" },
  },
  {
    id: "general-morning-water",
    emoji: "💧",
    title: "Start the day with water",
    body: "A glass first thing in the morning is a small habit that adds up over a month.",
    condition: { type: "general" },
  },

  // ---- General: portion / mindful eating (6) ----
  {
    id: "general-restaurant-portions",
    emoji: "🍽️",
    title: "Restaurant portions are often for sharing",
    body: "A \"one person\" portion of karahi, biryani, or rice at a restaurant is often closer to two servings.",
    condition: { type: "general" },
  },
  {
    id: "general-plate-vs-pot",
    emoji: "🍛",
    title: "Serve onto a plate, not from the pot",
    body: "Makes it much easier to actually notice how much you've had.",
    condition: { type: "general" },
  },
  {
    id: "general-screens-eating",
    emoji: "📱",
    title: "Screens make portions harder to track",
    body: "Eating in front of the TV or phone makes it easy to lose track -- just noticing this can help.",
    condition: { type: "general" },
  },
  {
    id: "general-smaller-plate",
    emoji: "🍽️",
    title: "A smaller plate helps without thinking",
    body: "Naturally leads to smaller portions without needing to consciously hold back.",
    condition: { type: "general" },
  },
  {
    id: "general-guess-higher",
    emoji: "🤔",
    title: "When unsure, guess higher",
    body: "If you're not sure of a portion, assuming it's slightly bigger is usually safer than assuming smaller.",
    condition: { type: "general" },
  },
  {
    id: "general-pause-before-seconds",
    emoji: "⏸️",
    title: "Pause before seconds",
    body: "Second helpings are fine -- just waiting a few minutes first helps tell real hunger from habit.",
    condition: { type: "general" },
  },

  // ---- General: consistency / streak encouragement (5) ----
  {
    id: "general-log-the-bad-days-too",
    emoji: "📝",
    title: "Log the over-target days too",
    body: "They're just as useful as the good days -- the data matters more than the number.",
    condition: { type: "general" },
  },
  {
    id: "general-missing-a-day",
    emoji: "🔄",
    title: "Missing a day doesn't undo anything",
    body: "The days before it still count -- just pick back up whenever you're ready.",
    condition: { type: "general" },
  },
  {
    id: "general-pattern-not-perfection",
    emoji: "📊",
    title: "It's a pattern over weeks, not a streak",
    body: "One off day means very little in the bigger picture.",
    condition: { type: "general" },
  },
  {
    id: "general-honest-logging",
    emoji: "✅",
    title: "Honest logging is what makes this useful",
    body: "Logging the \"bad\" days too is what makes your calorie target actually mean something.",
    condition: { type: "general" },
  },
  {
    id: "general-habit-is-the-hard-part",
    emoji: "💪",
    title: "The habit itself is the hard part",
    body: "Once logging becomes automatic, everything else about this gets easier.",
    condition: { type: "general" },
  },

  // ---- General: broadly useful facts (12) ----
  {
    id: "general-ghee-oil",
    emoji: "🫒",
    title: "Cooking fat often matters more than you think",
    body: "Ghee and oil are calorie-dense and easy to lose track of -- often a bigger factor in a dish than people assume.",
    condition: { type: "general" },
  },
  {
    id: "general-fiber-fullness",
    emoji: "🥦",
    title: "Fiber keeps you fuller longer",
    body: "Vegetables, daal, and whole grains help you feel satisfied longer than the same calories from refined carbs alone.",
    condition: { type: "general" },
  },
  {
    id: "general-fruit-for-sweet",
    emoji: "🍎",
    title: "Fruit for a sweet craving",
    body: "Satisfies it with less sugar and more nutrients than a dessert would.",
    condition: { type: "general" },
  },
  {
    id: "general-read-labels",
    emoji: "🏷️",
    title: "Reading a label takes 10 seconds",
    body: "And it can genuinely change what you choose, when there is one to read.",
    condition: { type: "general" },
  },
  {
    id: "general-dont-skip-to-save",
    emoji: "🍽️",
    title: "Skipping meals to \"save\" calories backfires",
    body: "Often leads to overeating at the next meal instead.",
    condition: { type: "general" },
  },
  {
    id: "general-sleep-hunger",
    emoji: "😴",
    title: "Sleep affects hunger",
    body: "A bad night's sleep can genuinely make you hungrier the next day -- it's not just willpower.",
    condition: { type: "general" },
  },
  {
    id: "general-spices-not-oil",
    emoji: "🌶️",
    title: "Lean on spices, not extra oil",
    body: "Turmeric, ginger, and garlic add real flavor without meaningful calories.",
    condition: { type: "general" },
  },
  {
    id: "general-everyone-different",
    emoji: "🧍",
    title: "Everyone's needs are different",
    body: "Comparing your intake to a friend's isn't a useful measure of anything -- your target is based on you.",
    condition: { type: "general" },
  },
  {
    id: "general-consistent-estimating",
    emoji: "⚖️",
    title: "Consistent estimating beats occasional precision",
    body: "A food scale is more accurate, but estimating the same way every time is good enough for most people.",
    condition: { type: "general" },
  },
  {
    id: "general-weekends-add-up",
    emoji: "📅",
    title: "Weekends often carry the week's extra calories",
    body: "That's normal, not a failure -- worth being aware of, not something to feel bad about.",
    condition: { type: "general" },
  },
  {
    id: "general-home-cooked-lighter",
    emoji: "🏠",
    title: "Home-cooked tends to be lighter",
    body: "Even simple home cooking usually has less oil and salt than the same dish eaten out.",
    condition: { type: "general" },
  },
  {
    id: "general-no-bad-foods",
    emoji: "🍽️",
    title: "There's no single \"bad\" food",
    body: "It's the pattern over days and weeks that matters, not any one meal.",
    condition: { type: "general" },
  },
];
