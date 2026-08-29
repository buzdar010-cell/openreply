/**
 * Short-form educational reads, a step up in depth from a one-line tip.
 * Same sourcing philosophy as tips.ts: hand-written, grounded in
 * well-established nutrition science, not AI-generated -- no Gemini cost,
 * no risk of a model improvising something subtly wrong in a health-
 * adjacent app.
 */

export interface Article {
  id: string;
  emoji: string;
  title: string;
  summary: string;
  body: string;
}

export const ARTICLES: Article[] = [
  {
    id: "sodium-in-pakistani-cooking",
    emoji: "🧂",
    title: "Why Pakistani food runs high in sodium -- and what to do about it",
    summary: "Salt shows up in more places than the shaker -- here's where, and how to balance it out.",
    body: `Pakistani cooking leans on salt in more places than most cuisines: it's in the base masala, in achar and pickles served on the side, in the yogurt raita, and often added again at the table. Slow-cooked dishes like nihari and karahi concentrate it further as liquid reduces during cooking, so the sodium per bite climbs even without anyone adding more salt.

None of this means avoiding these dishes -- they're a real part of the food culture here, and food is more than a spreadsheet of nutrients. What actually helps is balance across a day or a week rather than any single meal: pairing a rich, salty dish with plain daal, a simple salad, or unsalted rice; going easy on the extra achar on the side; and tasting food before reaching for more salt, since it's easy to add out of habit rather than need.

Sodium matters for two reasons. Short-term, it affects water retention -- a very salty day can leave you feeling puffier or thirstier than usual, which is water, not fat. Longer-term, consistently high sodium intake is linked to blood pressure, which is why the pattern over weeks matters more than any one nihari lunch. The World Health Organization recommends staying under about 2000mg of sodium a day (roughly a teaspoon of salt) -- most people eating rich, restaurant-style food regularly are well above that, and most people eating simply at home are closer to it. Logging consistently is the easiest way to actually see which category a given week falls into.`,
  },
  {
    id: "protein-sources-guide",
    emoji: "🍗",
    title: "Where's the protein? A guide to protein sources in everyday cooking",
    summary: "Beyond just chicken -- daal, dairy, and eggs all count, and often get underestimated.",
    body: `When people think "protein" they usually think meat, but a lot of the protein in Pakistani cooking comes from other places too. Daal is one of the most underrated sources -- a bowl of masoor or chana daal has real, meaningful protein for very little cost, and it's already a daily staple in most households. Dairy pulls its weight as well: yogurt, paneer, and milk-based drinks like lassi all contribute, on top of whatever protein is in the meal itself.

Among meats, leaner cuts and cooking methods matter more than people expect. Chicken breast has noticeably more protein per gram than thigh, for the same reason it's lower in fat. Grilled preparations -- seekh kebab, tikka -- tend to hold onto more of their protein-to-calorie ratio than fried ones, since less fat gets added in cooking.

Most adults do reasonably well hitting protein if meat is a regular part of their diet, but it's easy to fall short on lighter days -- a breakfast of just paratha and chai, for example, has very little. Eggs are one of the fastest fixes: cheap, quick to cook, and a genuinely good protein source. If a day's log is coming up light on protein, the easiest wins are usually daal, eggs, yogurt, or a lean cut of chicken rather than needing to eat "more" of everything.`,
  },
  {
    id: "restaurant-vs-home-portions",
    emoji: "🍽️",
    title: "Restaurant portions vs. home portions: why \"one plate\" means different things",
    summary: "A restaurant serving and a home serving of the same dish can differ by a lot more than they look.",
    body: `One of the most common places calorie estimates go wrong isn't the food itself -- it's the portion. A "plate" of biryani at a restaurant is often built to be shared or to look generous, and can easily be 1.5-2x what a home-cooked serving would be. The same goes for karahi, where restaurants tend to use more oil and ghee than most households would for everyday cooking, both for flavor and because it's cheaper to be generous with fat than with meat.

This isn't a reason to avoid eating out -- it's just useful to know when logging. If a meal was clearly restaurant-sized, it's worth logging it as more than one typical portion rather than assuming "one plate" always means the same amount of food. The app's dish database uses realistic home-style portion sizes as its baseline, so restaurant meals in particular are where logging a slightly bigger quantity than feels intuitive tends to be more accurate, not less.

The practical habit that helps most: if you know in advance a meal will be a restaurant one, treat it as its own thing rather than trying to eyeball it against a home-cooked version of the same dish in your head. Over time, most people find restaurant meals land close to double a home portion for rich dishes like biryani and karahi, and closer to home portions for simpler things like daal or grilled kebabs.`,
  },
  {
    id: "hydration-matters",
    emoji: "💧",
    title: "Hydration matters as much as food -- especially in Pakistan's climate",
    summary: "Water needs go up with the heat, and tracking food shouldn't mean forgetting to drink.",
    body: `It's easy for a food-tracking app to make food the only thing you're thinking about, but hydration deserves real attention too, particularly in a climate where summer temperatures regularly climb well past what's comfortable to be active in. The body loses water through sweat far faster in heat and humidity, and that water needs replacing beyond what tea, chai, or soft drinks provide -- caffeinated and sugary drinks don't hydrate the same way plain water does, and some (caffeine especially) have a mild diuretic effect that works against you.

A simple, well-known rule of thumb is to aim for water intake based on body weight and activity, roughly increasing with heat and exercise -- there's no single number that's right for everyone, but a common practical guide is not to rely on thirst alone as your only signal, since thirst tends to lag behind actual dehydration. Pale yellow urine is a more reliable everyday indicator than how thirsty you feel.

Beyond comfort, mild dehydration can also masquerade as hunger -- it's a genuinely common mix-up, since the signals for both originate in similar parts of the brain. If a craving hits shortly after a meal, or between meals with no clear reason, a glass of water before reaching for a snack is a reasonable first move, if nothing else because it costs nothing to try.`,
  },
  {
    id: "understanding-macros",
    emoji: "📊",
    title: "Understanding your macro breakdown: what protein, carbs, and fat actually do",
    summary: "The three numbers under your calorie total each do a different job -- here's what they mean.",
    body: `Calories measure energy, but protein, carbs, and fat -- the three macronutrients -- each play a different role beyond just contributing to that total.

Protein is the building block for muscle, skin, and most of the body's repair processes. It's also the most filling macro gram-for-gram, which is why it's often emphasized for both weight loss (it helps control hunger) and weight gain (it's what a calorie surplus needs to actually build, not just add fat). This app targets protein based on body weight rather than a flat percentage of calories, since protein need tracks how much of you there is to maintain, not how much you're eating overall.

Carbohydrates are the body's preferred, fastest energy source -- what fuels a workout, a busy day, or just normal brain function, since the brain runs almost entirely on carbs. Not all carbs behave the same way: fiber-rich carbs (vegetables, daal, whole grains) digest slowly and keep you fuller, while refined carbs (white rice, sugar, refined flour) digest fast and can leave you hungry again sooner.

Fat is calorie-dense (more than double protein or carbs per gram) but essential -- for hormone production, absorbing certain vitamins, and just making food taste like food. The target in this app sits around 30% of calories, within the commonly recommended range, not because fat is something to minimize but because it's easy to eat far more than needed simply because a little goes such a long way in cooking (ghee, oil, fried food).

None of the three is "bad" -- the targets exist to make sure each is getting enough attention, not to villainize any of them.`,
  },
  {
    id: "exercise-and-calorie-budget",
    emoji: "🏃",
    title: "How exercise actually affects your calorie budget",
    summary: "Exercise adds room to your day's target -- here's how that number gets calculated, and why it's an estimate.",
    body: `When you log a workout, this app adds the calories it estimates you burned onto your calorie target for the day -- if your target is 2200 and a run burns 300, your effective budget for the day becomes 2500. This is standard practice across nutrition apps, and it reflects something real: exercise does increase how much energy your body uses that day.

The number itself comes from a formula (MET, or "metabolic equivalent of task") that estimates energy burned based on activity type, your body weight, and how long you did it. It's a genuine estimate, not a precise measurement -- actual calorie burn varies with intensity, fitness level, and individual differences that a simple formula can't fully capture. Treat the number as a reasonable approximation, not a lab-grade result.

A common trap worth knowing about: it's easy to overestimate exercise calories and use that as license to eat back more than was actually burned, which quietly undoes the point of exercising in the first place if weight loss is the goal. A reasonable habit is to treat the exercise-adjusted budget as a ceiling, not a target to fill -- if you don't feel like eating all the "extra" room from a workout, that's completely fine.

Beyond calories, regular activity has benefits a calorie count doesn't capture at all -- cardiovascular health, mood, sleep quality, and long-term maintenance of muscle mass, especially important if you're in a calorie deficit where the body is more prone to losing muscle alongside fat.`,
  },
  {
    id: "why-crash-diets-backfire",
    emoji: "⚠️",
    title: "Why crash diets backfire (and what to do instead)",
    summary: "Extreme, fast weight loss usually costs more than it saves -- here's the actual mechanism.",
    body: `A very low-calorie diet produces fast results on the scale, which is exactly why it's tempting -- but the mechanism behind that fast result is also why it tends not to last. A severe deficit forces the body to lose weight quickly, but a meaningful portion of that early loss is water and muscle, not just fat, especially without enough protein or any resistance training to signal the body to hold onto muscle.

There's also a metabolic response: sustained, severe calorie restriction can lower your resting metabolic rate as the body adapts to functioning on less energy -- a real, measurable effect, not just a myth. Combined with the muscle loss, this means someone coming off a crash diet often has a lower calorie need than before they started, which is part of why weight tends to come back afterward, sometimes past the starting point.

There's a behavioral cost too. Very restrictive eating is hard to sustain, both because of hunger and because it usually means cutting out foods and social eating entirely rather than moderating them -- which makes it more likely to end in an all-or-nothing swing back the other way.

The safety floor in this app (never recommending under 1200 calories a day, regardless of inputs) exists specifically because of this pattern. A moderate deficit -- roughly 500 calories a day below maintenance, which is what "lose" targets here -- produces slower results, but results that are much more likely to actually stick, since it's a change most people can sustain for months rather than weeks.`,
  },
  {
    id: "eating-out-vs-home-cooked",
    emoji: "🍳",
    title: "Eating out vs. home-cooked: the real calorie gap",
    summary: "Same dish name, different calorie reality -- here's why, and it's not just the portion.",
    body: `Two plates of chicken karahi can look identical and carry meaningfully different calorie counts, and portion size is only part of the story. Restaurants generally cook with more oil and ghee than a home kitchen would for everyday meals -- partly for flavor and mouthfeel, partly because fat is a relatively cheap way to make a dish taste rich. The same applies to salt: restaurant food is often seasoned more heavily than most people season food at home, partly to make an impression on a first bite.

This is worth knowing not as a reason to avoid eating out, but as context for logging. If a dish is described the same way in both settings ("chicken karahi"), the actual nutrition can differ by a meaningful margin depending on where it came from -- restaurant versions tend to run higher in both calories and sodium than the same dish made simply at home.

The practical takeaway isn't to eliminate eating out, which is a normal and enjoyable part of life, but to be aware that a week with several restaurant meals is a genuinely different week, nutritionally, than a week of mostly home-cooked food, even if the dish names on paper look the same. Balancing the two -- treating restaurant meals as a bit richer than they might appear, and leaning on home cooking the rest of the time -- tends to be a more sustainable approach than either extreme.`,
  },
  {
    id: "understanding-your-calorie-target",
    emoji: "🎯",
    title: "Understanding your daily calorie target: where that number actually comes from",
    summary: "Not a guess -- your target is calculated from a real, well-established formula.",
    body: `Your daily calorie target isn't arbitrary -- it's calculated using the Mifflin-St Jeor equation, one of the most widely used and validated formulas for estimating energy needs, based on your weight, height, age, and gender. That calculation gives your BMR (basal metabolic rate): roughly the energy your body would use lying still all day, just keeping itself running.

From there, your activity level (sedentary through very active) multiplies that number up to estimate your TDEE (total daily energy expenditure) -- what you'd burn in a typical day given how active you actually are, not just resting. This is the number your calorie target is actually built from.

Finally, your goal shifts that number: maintain keeps it as-is, lose subtracts roughly 500 calories a day (enough for about a pound of fat loss per week, a well-established and sustainable pace), and gain adds the same amount in the other direction. There's also a safety floor -- the target will never go below 1200 calories a day, regardless of what the raw formula would suggest, since going lower isn't safe to recommend without medical supervision.

This number is an estimate, not a precise measurement of your exact metabolism -- individual variation exists that no formula fully captures. But it's a genuinely evidence-based starting point, not a guess, and it's worth updating your profile (weight, activity level, goal) periodically so it keeps tracking who you actually are, not who you were when you first set it up.`,
  },
];
