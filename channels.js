// The channel lineup. Organized by *originating network* first, then by genre
// and theme -- channels 4-21 are the networks a show first aired on (ABC, CBS,
// NBC, Fox, Nickelodeon, first-run syndication), which is an axis nothing in
// the old lineup used. Everything below that is the older genre/theme tier,
// kept where it still has an identity of its own.
//
// Three kinds of channel:
//
//   kind: "genre"   — content pool is *every* show in the catalog tagged
//                      with `genre`, derived at runtime from catalog.json.
//                      Zero manual curation; scales automatically as
//                      VaultVision's library grows and tools/build-catalog.py
//                      is re-run.
//   kind: "curated" — a hand-picked pool, optionally gated to specific
//                      days/hours via `daypart`. Outside any daypart window
//                      (or for channels with no daypart at all — always-on
//                      "networks"), `fallbackPool` plays instead — real
//                      affiliates don't go dark between their special
//                      blocks, they run filler.
//   kind: "vod"     — not a scheduled simulation at all: a browsable menu
//                      (see vod.js) driven live off the catalog, sectioned
//                      by genre same as the "genre" channels above.
//
// `daypart[].days` is 0=Sunday..6=Saturday (Date#getDay()). Windows must not
// overlap for a single channel; the scheduler takes the first match. A window
// that crosses midnight is written as two windows (23–24 and 0–5), since
// matchingWindow compares against getHours(). `daypart[].ordered` keeps a pool
// in catalog order instead of shuffling it — for serials that only make sense
// front-to-back. `tagline` is pure flavor, shown under the channel name in the
// OSD banner.
//
// A show deliberately appears on more than one channel: this is a rerun
// simulator, and the same series legitimately belonged to a network, a decade,
// and a genre at once. What it must never do is appear twice inside one pool —
// tools/check-channels.js fails on that.
//
// The block recordings (TGIF, SNICK, NickAtNite, FoxKids, SatMorning,
// MonsterVision, SciFiAnime) are no longer channels of their own. They're
// dayparts on the network that aired them, which is what they always were.
//
// KIDS & LEARNING sits on channel 3 — the lowest tunable slot, so it's the
// front door when tuning up from the bottom. The guide keeps channel 1 (real
// cable lineups commonly skip it too) and VIDEO ON DEMAND channel 2, which
// also makes VOD the topmost row in the guide's own listings.
//
// Plain script, not a module (see scheduler.js's header for why) — loaded via
// <script src="channels.js">, so file:// pages can load it too.
const GUIDE_CHANNEL = 1;
const VOD_CHANNEL = 2;
window.GUIDE_CHANNEL = GUIDE_CHANNEL;
window.VOD_CHANNEL = VOD_CHANNEL;

window.CHANNELS = [
  { number: GUIDE_CHANNEL, name: "TV GUIDE", kind: "guide", tagline: "What's on, eventually." },
  { number: VOD_CHANNEL, name: "🎬 VIDEO ON DEMAND", kind: "vod", tagline: "Now playing." },
  {
    number: 3, name: "KIDS & LEARNING", kind: "curated",
    tagline: "Homework help, sort of.",
    daypart: [],
    fallbackPool: [
      "BillNye", "AdventuresinWonderland", "GummiBears",
      "BerenstainBears", "Ghostwriter", "SchoolhouseRock", "LittleBear",
      "CliffordtheBigRedDogSeriesSeries", "Zoboomafoo",
      "BertandErniesGreatAdventures", "RoundtheTwist", "AllegrasWindow",
      "Wishbone", "MouseFactory", "MrMen", "JimHensonHour",
      "CosmosaPersonalVoyage", "PlanetEarth",
      "WonderPetsEpisodeswithMissingEpisodes",
      "MartyStouffersWildAmerica",
    ],
  },
  {
    number: 4, name: "ABC PRIMETIME", kind: "curated",
    tagline: "Thank goodness it's Friday.",
    // TGIF is the Friday block it always was -- the tape itself plus the four
    // shows that ran in it. Every other night is the rest of ABC's comedy.
    daypart: [
      { days: [5], startHour: 20, endHour: 22, pool: [
        "TGIF", "FamilyMatters", "GrowingPains", "JusttheTenofUs",
        "StepByStep",
      ] },
    ],
    fallbackPool: [
      "DrewCareyShow", "HomeImprovement", "Coach", "Taxi1978",
      "McHalesNavySeries", "DharmaAndGreg", "JeffFoxworthyShow",
      "BosomBuddies", "SoulMan", "TeenAngel",
      "CavemenSeriesSlightlyBetterQuality", "YouWish",
    ],
  },
  {
    number: 5, name: "ABC DRAMA", kind: "curated",
    tagline: "Alphabet network, after dark.",
    // Dark Shadows is 1,239 continuous chapters -- useless to drop into at
    // random, so it gets the overnight to itself and plays `ordered`, front to
    // back, looping at the finale (see buildPool in scheduler.js).
    daypart: [
      { days: [0, 1, 2, 3, 4, 5, 6], startHour: 0, endHour: 5, ordered: true, pool: [
        "DarkShadowsTheSeries",
      ] },
    ],
    fallbackPool: [
      "NYPDBlue", "WonderYears", "DoogieHowserMD", "LifeGoesOn",
      "TwinPeaks", "BattlestarGalactica", "Rookies", "MaxHeadroom",
      "BarbaryCoast", "LifeAsWeKnowIt", "Automan", "666ParkAvenueSeries",
      "CopRock", "BlueThunder",
    ],
  },
  {
    number: 6, name: "CBS CLASSICS", kind: "curated",
    tagline: "The eye has a long memory.",
    daypart: [],
    fallbackPool: [
      "MASH", "Jeffersons", "LeaveIttoBeavertheSeries",
      "PetticoatJunction", "Newhart", "GreenAcres", "MaryTylerMooreShow",
      "DickVanDyke", "TheLucyShow", "HeresLucy", "MisterEd",
      "ArchieBunkersPlace", "WkrpinCincinnati", "AllInTheFamily",
    ],
  },
  {
    number: 7, name: "CBS PRIMETIME", kind: "curated",
    tagline: "Tiffany network, prime hours.",
    daypart: [],
    fallbackPool: [
      "MurphyBrown", "EverybodyLovesRaymond", "KingofQueens",
      "DesigningWomen", "Nanny", "StillStanding", "BlessThisHouse",
    ],
  },
  {
    number: 8, name: "CBS DRAMA", kind: "curated",
    tagline: "An hour at a time.",
    daypart: [],
    fallbackPool: [
      "NorthernExposure", "DueSouth", "Jericho", "BrooklynSouth",
      "LogansRun", "DallastheSeries",
    ],
  },
  {
    number: 9, name: "NBC CLASSIC", kind: "curated",
    tagline: "Peacock, full plumage.",
    daypart: [],
    fallbackPool: [
      "SavedByTheBell", "CosbyShow", "FactsofLife", "NightCourt",
      "GetSmart", "MamasFamily", "TheHoganFamily", "ALFtheSeries",
      "PunkyBrewster", "TheMonkees", "EerieIndiana", "ItsYourMove",
    ],
  },
  {
    number: 10, name: "NBC MUST SEE", kind: "curated",
    tagline: "Thursday, all week long.",
    daypart: [],
    fallbackPool: [
      "MadAboutYou", "NewsRadio", "CarolineInTheCity", "VeronicasCloset",
      "Joey", "Wings", "WeberShow", "Tucker",
    ],
  },
  {
    number: 11, name: "NBC ACTION", kind: "curated",
    tagline: "A plan comes together hourly.",
    daypart: [],
    fallbackPool: [
      "ATeam", "HighwayToHeaven", "KnightRider", "Baywatch",
      "BuckRogers", "V1983", "Chase",
    ],
  },
  {
    number: 12, name: "FOX FUNNY", kind: "curated",
    tagline: "The fourth network laughs last.",
    daypart: [],
    fallbackPool: [
      "MADtv", "MalcolmInTheMiddle", "InLivingColor", "ParkerLewis",
      "NedAndStacey", "PJs", "MarriedWithChildren", "BernieMacShow",
      "Simpsons", "BacktoYou", "BakersfieldPD", "Action", "Mulaney",
      "BenStillerShow", "Woops", "Tick",
    ],
  },
  {
    number: 13, name: "FOX DRAMA", kind: "curated",
    tagline: "Cancelled too soon, airing forever.",
    daypart: [],
    fallbackPool: [
      "PartyOfFive", "TheOC", "Millennium", "BriscoCountyJr",
      "LoneGunmen", "FireflySeries",
    ],
  },
  {
    number: 14, name: "FOX KIDS", kind: "curated",
    tagline: "Weekday afternoons, permanently.",
    // The block tape airs in its own slot; the toons that filled it run the rest
    // of the week.
    daypart: [
      { days: [6], startHour: 8, endHour: 12, pool: [
        "FoxKids", "PowerRangers", "BatmanTAS", "XMen", "SpiderManTAS",
      ] },
    ],
    fallbackPool: [
      "Digimon", "Animaniacs", "BobbysWorld", "TheTick", "Godzilla",
      "TMNTNextMutation",
    ],
  },
  {
    number: 15, name: "NICKELODEON", kind: "curated",
    tagline: "Slime not included.",
    // SNICK on Saturday night and Nick at Nite after 11, same as it aired. The
    // overnight pads the 5 block recordings with the classic sitcoms Nick at
    // Nite actually ran -- they live on ch 6/9 too, which is the point of a
    // rerun channel.
    daypart: [
      { days: [6], startHour: 20, endHour: 22, pool: [
        "SNICK",
      ] },
      { days: [0, 1, 2, 3, 4, 5, 6], startHour: 23, endHour: 24, pool: [
        "NickAtNite", "LeaveIttoBeavertheSeries", "PetticoatJunction",
        "GreenAcres", "MaryTylerMooreShow", "DickVanDyke", "TheLucyShow",
        "HeresLucy", "MisterEd", "GetSmart", "Taxi1978", "Newhart",
        "TheMonkees", "BosomBuddies",
      ] },
      { days: [0, 1, 2, 3, 4, 5, 6], startHour: 0, endHour: 5, pool: [
        "NickAtNite", "LeaveIttoBeavertheSeries", "PetticoatJunction",
        "GreenAcres", "MaryTylerMooreShow", "DickVanDyke", "TheLucyShow",
        "HeresLucy", "MisterEd", "GetSmart", "Taxi1978", "Newhart",
        "TheMonkees", "BosomBuddies",
      ] },
    ],
    fallbackPool: [
      "SpongeBobSquarePants", "FairlyOddParents", "GUTS",
      "AreYouAfraidOfTheDark", "AlexMack", "NickArcade", "HeyDude",
      "InvaderZIM", "KaBlam", "RenAndStimpy", "RockosModernLife",
      "SaluteYourShorts", "Animorphs",
    ],
  },
  {
    number: 16, name: "SATURDAY MORNING", kind: "curated",
    tagline: "Eat your cereal.",
    // The six SatMorning recordings run 107-365 minutes -- a whole morning each.
    // Gated to Saturday morning so they never interrupt the weekday rotation of
    // 22-minute cartoons.
    daypart: [
      { days: [6], startHour: 8, endHour: 12, pool: [
        "SatMorning",
      ] },
    ],
    fallbackPool: [
      "GarfieldandFriendsSeries", "RockyandBullwinkleShow", "Recess",
      "AlvinandtheChipmunks", "MuppetBabies", "Animaniacs",
      "Beetlejuice", "PeabodysImprobableHistory", "BobbysWorld",
      "TheMaskAnimatedSeries", "Histeria",
      "AceVenturaPetDetectiveSeries", "WackyRacesSeries",
      "MotormouseandAutocat", "CaptainN", "CampCandy",
      "SonictheHedgehog", "LandOfTheLost1991",
      "MightyMousetheNewAdventures", "CattanoogaCatstheSeries",
      "JosieandthePussycatsTVseries", "PolePosition", "GarbagePailKids",
      "KarateKid", "Houndcats",
    ],
  },
  {
    number: 17, name: "CARTOON CARTOONS", kind: "curated",
    tagline: "Basic cable, drawn by hand.",
    daypart: [],
    fallbackPool: [
      "PowerpuffGirls", "CampLakebottom", "DuckDodgers",
      "DextersLaboratorytheSeries",
      "EdEddNEddySeriesAllEpisodesandSpecials", "CaspersScareSchool",
      "CouragetheCowardlyDog", "ArchiesWeirdMysteries", "GravityFalls",
      "LandBeforeTime", "MorphFiles", "SwanBoy",
    ],
  },
  {
    number: 18, name: "TOON AFTERNOON", kind: "curated",
    tagline: "Straight from the syndication truck.",
    daypart: [],
    fallbackPool: [
      "TeenageMutantNinjaTurtles", "CaptainPlanet", "TinyToonAdventures",
      "DarkwingDucktheSeries", "HeathcliffandtheCatillacCatsTVSeries",
      "InspectorGadget", "DuckTalesSeriesWorkinProgress", "MutantLeague",
      "AdventuresOfSonic", "BikerMiceFromMars", "RamboTheForceofFreedom",
      "EagleRiders", "BuzzLightyearofStarCommand",
      "BeastWarsTransformers", "LippytheLionandHardyHarHar",
      "WallyGator", "MightyMax", "PoliceAcademyTheAnimatedSeries",
      "StarcomtheUSSpaceForceSeries",
    ],
  },
  {
    number: 19, name: "SECTOR 7", kind: "curated",
    tagline: "Warp factor rerun.",
    // 11 anime-block tapes, ~2h each: one Saturday night gets 11 weeks of unique
    // programming, where two-a-night would burn through it in five.
    daypart: [
      { days: [6], startHour: 20, endHour: 24, pool: [
        "SciFiAnime",
      ] },
    ],
    fallbackPool: [
      "DoctorWho", "StarTrekTNG", "StarTrekDS9", "StarTrekVoyager",
      "GeneRoddenberrysAndromeda", "Xena", "Space1999", "TekWar",
      "RoboCopliveactionTVseries", "JackofAllTradesTVseries",
      "MortalKombatConquest", "HitchhikersGuidetotheGalaxy",
    ],
  },
  {
    number: 20, name: "ANTHOLOGY", kind: "curated",
    tagline: "A different story every week.",
    daypart: [],
    fallbackPool: [
      "AlfredHitchcockPresents", "TwilightZone1959",
      "AreYouAfraidOfTheDark", "NewAlfredHitchcockPresents",
      "AmazingStories",
    ],
  },
  {
    number: 21, name: "ADVENTURE NETWORK", kind: "curated",
    tagline: "Car chases guaranteed.",
    daypart: [],
    fallbackPool: [
      "NYPDBlue", "PartyOfFive", "WonderYears", "ATeam",
      "HighwayToHeaven", "NorthernExposure", "SwitchedatBirth",
      "DoogieHowserMD", "TheOC", "Everwood", "KnightRider", "Baywatch",
      "DueSouth", "CharmedtheSeries", "BuckRogers", "IntotheBadlands",
      "TwinPeaks", "Jericho", "BriscoCountyJr", "Animorphs",
      "BattlestarGalactica", "Persuaders", "Rookies", "V1983",
      "BrooklynSouth", "TheNetAmericanTVseries", "Chase", "LoneGunmen",
      "BarbaryCoast", "FireflySeries", "LogansRun", "MaxHeadroom",
      "Automan", "DallastheSeries", "HandmaidsTaleSeries",
      "LifeAsWeKnowIt", "Middleman", "BlueThunder", "CopRock", "Tick",
    ],
  },
  { number: 22, name: "ANIME ZONE", kind: "genre", genre: "Anime",
    tagline: "Dubbed, subbed, and everything between." },
  { number: 23, name: "LAUGH TRACK", kind: "genre", genre: "Sketch Comedy & Late Night",
    tagline: "Live from a soundstage somewhere." },
  { number: 24, name: "MOVIE VAULT", kind: "genre", genre: "TV Movies",
    tagline: "Feature presentation, every hour." },
  { number: 25, name: "REALITY CHECK", kind: "genre", genre: "Reality TV",
    tagline: "Unscripted. Mostly." },
  {
    number: 26, name: "CHILLER", kind: "curated",
    tagline: "Leave a light on.",
    // MonsterVision two a night from 8 -- 76 tapes at a ~2h median fills to
    // midnight and runs 38 nights before repeating.
    daypart: [
      { days: [0, 1, 2, 3, 4, 5, 6], startHour: 20, endHour: 24, pool: [
        "MonsterVision",
      ] },
    ],
    fallbackPool: [
      "Millennium", "BeyondReality", "FreddysNightmares",
      "SapphireandSteel", "AshvsEvilDead", "AmericanGothic1995",
      "Spooksville", "HammerHouseofHorror",
    ],
  },
  {
    number: 27, name: "QUEENS & RAYMOND", kind: "curated",
    tagline: "Married, with in-laws.",
    daypart: [],
    fallbackPool: [
      "EverybodyLovesRaymond", "KingofQueens", "Reba",
    ],
  },
  {
    number: 28, name: "LATE SHOW", kind: "curated",
    tagline: "Past your bedtime.",
    daypart: [],
    fallbackPool: [
      "MADtv", "MASH", "MurphyBrown", "NightCourt", "ConanOBrien",
      "Taxi1978", "WkrpinCincinnati", "InsomniacwithDaveAttell",
      "MarriedWithChildren",
    ],
  },
  {
    number: 29, name: "MIDNIGHT PRECINCT", kind: "curated",
    tagline: "The city that never reruns.",
    daypart: [],
    fallbackPool: [
      "NYPDBlue", "NorthernExposure", "TwinPeaks", "Rookies",
      "BrooklynSouth", "Chase", "DallastheSeries", "CopRock",
    ],
  },
  {
    number: 30, name: "NIGHTMARE ALLEY", kind: "curated",
    tagline: "Stephen King, wall to wall.",
    daypart: [],
    fallbackPool: [
      "AlfredHitchcockPresents", "TwilightZone1959", "TheShining1997",
      "Tommyknockers", "It1990", "StormOfTheCentury", "TheStand1994",
      "SometimesTheyComeBack",
    ],
  },
  {
    number: 31, name: "TWILIGHT HOUR", kind: "curated",
    tagline: "Expect the unexpected, on schedule.",
    daypart: [],
    fallbackPool: [
      "DarkShadowsTheSeries", "AlfredHitchcockPresents",
      "TwilightZone1959", "NewAlfredHitchcockPresents", "Millennium",
      "AmazingStories", "FreddysNightmares", "SapphireandSteel",
      "AshvsEvilDead", "AmericanGothic1995", "HammerHouseofHorror",
      "666ParkAvenueSeries",
    ],
  },
  {
    number: 32, name: "EERIE AFTER SCHOOL", kind: "curated",
    tagline: "Scary, but you'll still make curfew.",
    daypart: [],
    fallbackPool: [
      "AreYouAfraidOfTheDark", "CaspersScareSchool",
      "CaspertheFriendlyGhost", "BeyondReality", "Spooksville",
      "EerieIndiana",
    ],
  },
  {
    number: 33, name: "GUNDAM & GIANT ROBOTS", kind: "curated",
    tagline: "Giant robots, on the hour.",
    daypart: [],
    fallbackPool: [
      "UltimateMuscleSeries", "BeastWarsTransformers",
      "MobileSuitGundamWing", "MobileSuitGundamSEED",
      "MobileSuitGundam00", "MobileSuitGundam0083",
      "MobileSuitGundam08thMSTeam", "MobileSuitGundamMovies",
    ],
  },
  {
    number: 34, name: "DBZ MARATHON", kind: "curated",
    tagline: "It's over 9000 reruns.",
    daypart: [],
    fallbackPool: [
      "DragonBallZ", "DragonBall", "DragonBallSuper", "DragonBallZKai",
      "DragonBallGT", "DragonBallZMovies",
    ],
  },
  {
    number: 35, name: "POKEMON ISLAND", kind: "curated",
    tagline: "Gotta watch 'em all.",
    daypart: [],
    fallbackPool: [
      "Digimon", "PokemonIndigoLeague", "MonsterRancher",
      "PokemonOrangeIslands", "PokmonChronicles",
    ],
  },
  {
    number: 36, name: "SUNDAY FUNNIES", kind: "curated",
    tagline: "Ink, paint, and nothing after 1979.",
    daypart: [],
    fallbackPool: [
      "PopeyetheSailorMan", "RockyandBullwinkleShow",
      "LOONEYTUNESSERIES", "PeabodysImprobableHistory",
      "LippytheLionandHardyHarHar", "WallyGator",
      "CaspertheFriendlyGhost", "MotormouseandAutocat",
      "WackyRacesSeries", "HermanandKatnip", "CelebritysComicolor",
      "CattanoogaCatstheSeries", "JosieandthePussycatsTVseries",
      "Houndcats",
    ],
  },
  {
    number: 37, name: "PRIME TIME SOAPS", kind: "curated",
    tagline: "Big hair, bigger drama.",
    daypart: [],
    fallbackPool: [
      "PartyOfFive", "NorthernExposure", "TheOC", "Everwood",
      "TwinPeaks", "DallastheSeries",
    ],
  },
  {
    number: 38, name: "WILD WEST & SWORDPLAY", kind: "curated",
    tagline: "Duels, both sword and six-shooter.",
    daypart: [],
    fallbackPool: [
      "Xena", "BriscoCountyJr", "JackofAllTradesTVseries",
      "BarbaryCoast",
    ],
  },
  {
    number: 39, name: "BAYWATCH NIGHTS", kind: "curated",
    tagline: "Slow motion, fast cars.",
    daypart: [],
    fallbackPool: [
      "ATeam", "KnightRider", "Baywatch", "Automan", "BlueThunder",
    ],
  },
  {
    number: 40, name: "THE WONDER HOUR", kind: "curated",
    tagline: "Growing up, one rerun at a time.",
    daypart: [],
    fallbackPool: [
      "MalcolmInTheMiddle", "WonderYears", "DoogieHowserMD",
      "ParkerLewis",
    ],
  },
  {
    number: 41, name: "THE LEARNING CHANNEL", kind: "curated",
    tagline: "Edutainment, on a schedule.",
    daypart: [],
    fallbackPool: [
      "BillNye", "SchoolhouseRock", "CosmosaPersonalVoyage",
      "PlanetEarth", "MartyStouffersWildAmerica",
    ],
  },
  {
    number: 42, name: "TRUE CRIME TONIGHT", kind: "curated",
    tagline: "Real cops, real stunts, real reruns.",
    daypart: [],
    fallbackPool: [
      "NYPDBlue", "WorldsWildestPoliceVideos",
      "MostExtremeEliminationChallenge", "BeyondScaredStraight2",
      "Rookies", "Chase", "LivePD", "JuryDutySeries",
    ],
  },
  {
    number: 43, name: "STAND-UP & SLAPSTICK", kind: "curated",
    tagline: "Comedy that might need stitches.",
    daypart: [],
    fallbackPool: [
      "CelebrityDeathmatch", "WhitestKidsUKnow",
      "InsomniacwithDaveAttell", "Jackass",
    ],
  },
  {
    number: 44, name: "TEEN ACTION THEATER", kind: "curated",
    tagline: "Capes, transformations, and turtle power.",
    daypart: [],
    fallbackPool: [
      "TeenageMutantNinjaTurtles", "CaptainPlanet", "BatmanTAS", "XMen",
      "TeenTitansSeries", "MutantLeague", "SpiderManTAS",
      "BikerMiceFromMars", "EagleRiders", "RamboTheForceofFreedom",
      "TransformersPrime", "InvaderZIM", "BatmanBeyond",
      "TheMaskAnimatedSeries", "BeastWarsTransformers", "MightyMax",
      "TheTick", "Godzilla", "RockosModernLife", "TMNTNextMutation",
      "MotorcityTVseries", "KarateKid", "StarcomtheUSSpaceForceSeries",
    ],
  },
  {
    number: 45, name: "THE AGENCY", kind: "curated",
    tagline: "Trust no one. Except the schedule.",
    daypart: [],
    fallbackPool: [
      "GetSmart", "Persuaders", "TekWar", "MaxHeadroom",
    ],
  },
  {
    number: 46, name: "LATE NIGHT CARTOONS", kind: "curated",
    tagline: "Not for the kids' table.",
    daypart: [],
    fallbackPool: [
      "BeavisButthead", "BigMouth", "Duckman", "Daria", "Boondocks",
      "BobandMargaret", "RenAndStimpy", "MoralOrel", "PJs",
      "DrawnTogether", "BrakShowSeries", "Simpsons", "Oblongs",
      "SpawntheAnimatedSeriesSeries480x480", "Undergrads", "HomeMovies",
      "AeonFlux",
    ],
  },
  {
    number: 47, name: "ANIME MIDNIGHT", kind: "curated",
    tagline: "Subtitles after dark.",
    daypart: [],
    fallbackPool: [
      "DragonBallZ", "Digimon", "LodossWarSeriesEnglishDub",
      "NeonGenesisEvangelion", "Berserk1997", "AttackonTitan",
      "MobileSuitGundam0083", "BubblegumCrisistheSeriesDualAudioHD",
    ],
  },
  {
    number: 48, name: "BLACK & WHITE HOUR", kind: "curated",
    tagline: "Before color, and none the worse.",
    daypart: [],
    fallbackPool: [
      "LeaveIttoBeavertheSeries", "DickVanDyke", "TheLucyShow",
      "MisterEd", "McHalesNavySeries",
    ],
  },
  {
    number: 49, name: "FAMILY HOUR", kind: "curated",
    tagline: "A lesson learned before the credits.",
    daypart: [],
    fallbackPool: [
      "CosbyShow", "FactsofLife", "DesigningWomen", "MamasFamily",
      "TheHoganFamily", "HighwayToHeaven", "ALFtheSeries",
      "ArchieBunkersPlace", "LifeGoesOn", "HarryandtheHendersons",
      "BlessThisHouse", "JusttheTenofUs", "BosomBuddies", "ItsYourMove",
    ],
  },
  {
    number: 50, name: "APARTMENT 5B", kind: "curated",
    tagline: "Nobody here has a real job.",
    daypart: [],
    fallbackPool: [
      "Nanny", "Reba", "UnhappilyEverAfter", "AreWeThereYet",
      "StillStanding", "WhatILikeAboutYou", "VeronicasCloset",
      "DharmaAndGreg", "RudeAwakening", "NedAndStacey", "Joey",
      "SoulMan", "BernieMacShow",
    ],
  },
  {
    number: 51, name: "STORYTIME", kind: "curated",
    tagline: "Read along if you like.",
    daypart: [],
    fallbackPool: [
      "AdventuresinWonderland", "BerenstainBears", "Ghostwriter",
      "NickArcade", "LittleBear", "CliffordtheBigRedDogSeriesSeries",
      "Zoboomafoo", "RoundtheTwist", "BertandErniesGreatAdventures",
      "Wishbone", "MouseFactory", "MrMen", "LandOfTheLost1991",
      "TheWorldofDavidtheGnome", "JimHensonHour",
      "WonderPetsEpisodeswithMissingEpisodes",
    ],
  },
  {
    number: 52, name: "SKETCH VAULT", kind: "curated",
    tagline: "Bits, and nothing but.",
    daypart: [],
    fallbackPool: [
      "WhoseLineIsItAnyway", "InLivingColor", "MontyPythonsFlyingCircus",
      "ABCsFridays", "BenStillerShow", "HeyVernIt",
    ],
  },
  {
    number: 53, name: "CULT & CANCELLED", kind: "curated",
    tagline: "Thirteen episodes, no more.",
    daypart: [],
    fallbackPool: [
      "Jericho", "Animorphs", "TheNetAmericanTVseries",
      "MortalKombatConquest", "BakersfieldPD", "TeenAngel", "WeberShow",
      "LoneGunmen", "Ted", "FireflySeries",
      "CavemenSeriesSlightlyBetterQuality", "Action", "Tucker",
      "YouWish", "Mulaney", "LifeAsWeKnowIt", "Middleman", "Woops",
    ],
  },
  {
    number: 54, name: "CREATURE DOUBLE FEATURE", kind: "curated",
    tagline: "Monsters, madmen, and made-for-TV mayhem.",
    daypart: [],
    fallbackPool: [
      "MonsterVision", "TheShining1997", "Tommyknockers", "TheExorcist",
      "TheTexasChainsawMassacre2", "AmericanWerewolfInLondon", "Trucks",
      "CurseOfTheBlairWitch", "TheDeadZone", "SingleWhiteFemale",
      "ShallowGrave", "TheBeast", "It1990", "StormOfTheCentury",
      "TheStand1994", "SometimesTheyComeBack",
    ],
  },
  {
    number: 55, name: "60s & 70s SITCOM HOUR", kind: "curated",
    tagline: "Before the laugh track needed subtitles.",
    daypart: [],
    fallbackPool: [
      "MASH", "Jeffersons", "PetticoatJunction", "GreenAcres",
      "MaryTylerMooreShow", "DickVanDyke", "TheLucyShow", "HeresLucy",
      "MisterEd", "GetSmart", "Taxi1978", "McHalesNavySeries",
      "WkrpinCincinnati", "AllInTheFamily", "TheMonkees",
    ],
  },
  {
    number: 56, name: "80s SITCOMS", kind: "curated",
    tagline: "Shoulder pads and setups.",
    daypart: [],
    fallbackPool: [
      "MurphyBrown", "CosbyShow", "FactsofLife", "Newhart", "NightCourt",
      "GrowingPains", "DesigningWomen", "MamasFamily", "TheHoganFamily",
      "ALFtheSeries", "ArchieBunkersPlace", "PunkyBrewster",
      "JusttheTenofUs", "BosomBuddies", "MarriedWithChildren",
      "ItsYourMove",
    ],
  },
  {
    number: 57, name: "90s SITCOMS", kind: "curated",
    tagline: "Must-see, whenever you tune in.",
    daypart: [],
    fallbackPool: [
      "DrewCareyShow", "FamilyMatters", "EverybodyLovesRaymond",
      "KingofQueens", "SavedByTheBell", "HomeImprovement", "Coach",
      "MadAboutYou", "Nanny", "UnhappilyEverAfter", "NewsRadio",
      "CarolineInTheCity", "LifeGoesOn", "AlexMack", "ParkerLewis",
      "VeronicasCloset", "HeyDude", "DharmaAndGreg", "RudeAwakening",
      "NedAndStacey", "Popular", "JeffFoxworthyShow", "Wings",
      "SaluteYourShorts", "ZoeDuncanJackJane", "SoulMan",
      "ShastaMcNasty", "TeenAngel", "BakersfieldPD", "YouWish", "Action",
      "StepByStep",
    ],
  },
  {
    number: 58, name: "2000s SITCOMS", kind: "curated",
    tagline: "The last sitcoms before the mockumentary took over.",
    daypart: [],
    fallbackPool: [
      "MalcolmInTheMiddle", "Reba", "StillStanding", "WhatILikeAboutYou",
      "Joey", "BernieMacShow", "WeberShow", "BacktoYou",
      "CavemenSeriesSlightlyBetterQuality", "Tucker",
    ],
  },
  {
    number: 59, name: "SLAPSTICK & SCREWBALL", kind: "curated",
    tagline: "Nobody here keeps a straight face.",
    daypart: [],
    fallbackPool: [
      "PetticoatJunction", "GreenAcres", "MisterEd", "GetSmart",
      "McHalesNavySeries", "ShastaMcNasty", "MarriedWithChildren",
      "TeenAngel", "CavemenSeriesSlightlyBetterQuality", "Woops",
    ],
  },
];
