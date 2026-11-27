-- 0051_exercise_catalog.sql — a standard exercise library every trainer
-- starts with (Idan, 2026-11-27: "standard and common exercises with general
-- videos … the trainer could change and customize it").
--
-- HOW (Idan: "every trainer starts with it"):
--   * exercise_catalog: the standard exercises, shared and read-only from the
--     app — Hebrew and English name and form cues, muscle group (the app's
--     chip keys), sets × reps, and a demo video. 44 rows; each video was
--     checked on 2026-11-27 through YouTube's oEmbed endpoint (exists and
--     allows embedding). Edited by migrations only.
--   * The trainer's library stays exercises: a trainer gets their OWN copies
--     (name and cues in their language, the muscle group as the chip label
--     ExerciseForm writes), to edit, re-film or delete like any exercise.
--     exercises.catalog_slug remembers which standard exercise a copy came
--     from, one copy per trainer, so adding the catalog again only brings
--     back what's missing.
--   * New trainers get it when their profile is created (onboarding inserts
--     the profile with its role); existing trainers get it below.
--   * add_catalog_exercises(): the trainer adds the whole catalog or some of
--     it ("ספרייה כללית" in the Library). SECURITY INVOKER: the caller's own
--     RLS (exercises_owner_all) does the insert.
--
-- Re-runnable.

create table if not exists public.exercise_catalog (
  slug text primary key,
  position integer not null,
  muscle_group text not null check (muscle_group in ('legs', 'glutes', 'back', 'chest', 'shoulders', 'arms', 'core', 'other')),
  name_he text not null,
  name_en text not null,
  cues_he text,
  cues_en text,
  default_sets integer,
  default_reps integer,
  video_url text,
  created_at timestamptz not null default now()
);

alter table public.exercise_catalog enable row level security;
drop policy if exists exercise_catalog_read on public.exercise_catalog;
create policy exercise_catalog_read on public.exercise_catalog
  for select to authenticated using (true);
revoke all on public.exercise_catalog from anon, authenticated;
grant select on public.exercise_catalog to authenticated;

insert into public.exercise_catalog (slug, position, muscle_group, name_he, name_en, cues_he, cues_en, default_sets, default_reps, video_url) values
  ('back-squat', 10, 'legs', 'סקוואט עם מוט', 'Barbell back squat',
   E'רגליים ברוחב הכתפיים, אצבעות מעט החוצה\nחזה למעלה וגב ניטרלי לאורך כל התנועה\nיורדים עד שהירך מקבילה לרצפה ודוחפים דרך העקבים',
   E'Feet shoulder-width, toes slightly out\nChest up, neutral back the whole way\nSit down to parallel, drive up through the heels',
   4, 8, 'https://www.youtube.com/watch?v=-bJIpOq-LWk'),
  ('goblet-squat', 20, 'legs', 'גובלט סקוואט', 'Goblet squat',
   E'משקולת צמודה לחזה, מרפקים כלפי מטה\nהברכיים עוקבות אחרי האצבעות\nיורדים עמוק עם גב זקוף',
   E'Weight close to the chest, elbows down\nKnees track over the toes\nSit deep with an upright torso',
   3, 10, 'https://www.youtube.com/watch?v=3O77G_yiFUw'),
  ('leg-press', 30, 'legs', 'לחיצת רגליים במכונה', 'Leg press',
   E'גב ואגן צמודים לכרית לאורך כל החזרה\nכפות רגליים ברוחב האגן באמצע המשטח\nלא נועלים את הברכיים למעלה',
   E'Back and hips stay on the pad\nFeet hip-width in the middle of the platform\nDon''t lock the knees at the top',
   3, 10, 'https://www.youtube.com/watch?v=K5n2vg3oZa4'),
  ('walking-lunge', 40, 'legs', 'לאנג׳ים בהליכה', 'Walking lunges',
   E'צעד ארוך, הברך האחורית יורדת כמעט לרצפה\nגו זקוף ובטן אסופה\nדוחפים מהעקב של הרגל הקדמית',
   E'Long step, back knee drops close to the floor\nTall torso, core braced\nPush off the front heel',
   3, 10, 'https://www.youtube.com/watch?v=YYWhkctnP2o'),
  ('bulgarian-split-squat', 50, 'legs', 'סקוואט בולגרי', 'Bulgarian split squat',
   E'רגל אחורית על ספסל, הקדמית רחוקה מספיק\nרוב המשקל על הרגל הקדמית\nיורדים בשליטה ועולים דרך העקב',
   E'Back foot on a bench, front foot far enough out\nMost of the weight on the front leg\nLower under control, drive up through the heel',
   3, 8, 'https://www.youtube.com/watch?v=-4LVK1crLSw'),
  ('leg-extension', 60, 'legs', 'פשיטת ברכיים במכונה', 'Leg extension',
   E'הברך בקו עם ציר המכונה\nהכרית מעל הקרסול\nעצירה קצרה למעלה וירידה איטית',
   E'Knee in line with the machine''s pivot\nPad just above the ankle\nPause at the top, lower slowly',
   3, 12, 'https://www.youtube.com/watch?v=o90ocSBDJis'),
  ('lying-leg-curl', 70, 'legs', 'כפיפת ברכיים בשכיבה', 'Lying leg curl',
   E'הכרית מעל העקבים\nהאגן נשאר צמוד לספסל\nמכופפים עד הסוף ומורידים לאט',
   E'Pad just above the heels\nHips stay down on the bench\nCurl all the way, lower slowly',
   3, 12, 'https://www.youtube.com/watch?v=SbSNUXPRkc8'),
  ('standing-calf-raise', 80, 'legs', 'הרמות עקבים בעמידה', 'Standing calf raise',
   E'עולים גבוה על קצות האצבעות\nעצירה קצרה למעלה\nיורדים עד מתיחה מלאה, בלי לקפוץ',
   E'Rise high onto the toes\nPause at the top\nLower to a full stretch, no bouncing',
   3, 15, 'https://www.youtube.com/watch?v=KRJIKsY02nE'),
  ('romanian-deadlift', 90, 'glutes', 'דדליפט רומני', 'Romanian deadlift',
   E'מתחילים מהאגן: דוחפים אותו לאחור\nברכיים מעט כפופות, גב ישר\nהמוט צמוד לרגליים עד אמצע השוק',
   E'Start from the hips: push them back\nSoft knees, flat back\nBar close to the legs, down to mid-shin',
   3, 10, 'https://www.youtube.com/watch?v=uhghy9pFIPY'),
  ('hip-thrust', 100, 'glutes', 'היפ תראסט עם מוט', 'Barbell hip thrust',
   E'גב עליון על ספסל, המוט על האגן (עם ריפוד)\nדוחפים דרך העקבים ומכווצים את הישבן למעלה\nצלעות למטה, בלי להקשית את הגב',
   E'Upper back on a bench, bar on the hips (padded)\nDrive through the heels, squeeze the glutes at the top\nRibs down, don''t arch the lower back',
   3, 10, 'https://www.youtube.com/watch?v=Zp26q4BY5HE'),
  ('glute-bridge', 110, 'glutes', 'גשר ישבן', 'Glute bridge',
   E'שכיבה על הגב, ברכיים כפופות וכפות רגליים על הרצפה\nמרימים את האגן בעזרת הישבן\nקו ישר מהכתפיים עד הברכיים',
   E'On your back, knees bent, feet flat\nLift the hips with the glutes\nStraight line from shoulders to knees',
   3, 15, 'https://www.youtube.com/watch?v=KI6fjDqGZh4'),
  ('cable-kickback', 120, 'glutes', 'בעיטה לאחור בכבל', 'Cable glute kickback',
   E'רצועה מעל הקרסול, הטיה קלה קדימה\nבועטים לאחור ולמעלה ומכווצים את הישבן\nבלי להקשית את הגב התחתון',
   E'Strap above the ankle, slight forward lean\nKick back and up, squeeze the glute\nKeep the lower back still',
   3, 12, 'https://www.youtube.com/watch?v=bVrmtCI00Ys'),
  ('deadlift', 130, 'back', 'דדליפט', 'Deadlift',
   E'המוט מעל אמצע כף הרגל, צמוד לשוקיים\nגב ישר ובטן נעולה לפני המשיכה\nדוחפים את הרצפה ונועלים אגן למעלה',
   E'Bar over mid-foot, close to the shins\nFlat back, brace before you pull\nPush the floor away, lock out the hips',
   3, 5, 'https://www.youtube.com/watch?v=ZaTM37cfiDs'),
  ('pull-up', 140, 'back', 'מתח', 'Pull-up',
   E'אחיזה מעט רחבה מהכתפיים\nמתחילים מתלייה מלאה ומורידים שכמות\nמושכים עד שהסנטר מעל המוט',
   E'Grip slightly wider than the shoulders\nStart from a full hang, set the shoulder blades\nPull until the chin clears the bar',
   3, 8, 'https://www.youtube.com/watch?v=9yVGh3XbJ34'),
  ('lat-pulldown', 150, 'back', 'פולי עליון', 'Lat pulldown',
   E'ירכיים נעולות מתחת לכרית\nמושכים את המוט לחזה העליון, מרפקים כלפי מטה\nבלי להתנדנד אחורה',
   E'Thighs locked under the pad\nPull the bar to the upper chest, elbows down\nNo swinging back',
   3, 10, 'https://www.youtube.com/watch?v=CAwf7n6Luuc'),
  ('barbell-row', 160, 'back', 'חתירה עם מוט', 'Barbell row',
   E'הטיה קדימה מהאגן, גב ישר\nמושכים את המוט לבטן\nמקרבים שכמות ומורידים בשליטה',
   E'Hinge forward at the hips, flat back\nRow the bar to the stomach\nSqueeze the shoulder blades, lower under control',
   3, 8, 'https://www.youtube.com/watch?v=-xlBxIMqh3A'),
  ('seated-cable-row', 170, 'back', 'חתירה בכבל בישיבה', 'Seated cable row',
   E'ישיבה זקופה, גב ניטרלי\nמושכים את הידית לבטן ומקרבים שכמות\nהגו לא מתנדנד',
   E'Sit tall, neutral back\nPull the handle to the stomach, squeeze the shoulder blades\nKeep the torso still',
   3, 10, 'https://www.youtube.com/watch?v=GZbfZ033f74'),
  ('one-arm-db-row', 180, 'back', 'חתירה במשקולת ביד אחת', 'One-arm dumbbell row',
   E'יד וברך על הספסל, גב ישר\nמושכים את המשקולת לכיוון האגן\nבלי לסובב את הגו',
   E'Hand and knee on the bench, flat back\nRow the dumbbell toward the hip\nDon''t rotate the torso',
   3, 10, 'https://www.youtube.com/watch?v=pYcpY20QaE8'),
  ('bench-press', 190, 'chest', 'לחיצת חזה עם מוט', 'Barbell bench press',
   E'שכמות מקורבות, כפות רגליים נטועות ברצפה\nמורידים את המוט לחזה התחתון, מרפקים ב-45 מעלות\nדוחפים למעלה בקו ישר',
   E'Shoulder blades pinched, feet planted\nLower the bar to the lower chest, elbows at 45°\nPress straight up',
   4, 8, 'https://www.youtube.com/watch?v=rT7DgCr-3pg'),
  ('incline-db-press', 200, 'chest', 'לחיצת חזה בשיפוע עם משקולות', 'Incline dumbbell press',
   E'ספסל בשיפוע של 30–45 מעלות\nמורידים את המשקולות לצד החזה העליון\nבלי להקשית את הגב',
   E'Bench at 30–45°\nLower the dumbbells beside the upper chest\nDon''t arch the back',
   3, 10, 'https://www.youtube.com/watch?v=hChjZQhX1Ls'),
  ('db-bench-press', 210, 'chest', 'לחיצת חזה עם משקולות', 'Dumbbell bench press',
   E'שכמות מקורבות, מרפקים ב-45 מעלות\nמורידים עד גובה החזה בשליטה\nהמשקולות נפגשות מעל החזה',
   E'Shoulder blades set, elbows at 45°\nLower to chest level under control\nDumbbells meet over the chest',
   3, 10, 'https://www.youtube.com/watch?v=Y_7aHqXeCfQ'),
  ('push-up', 220, 'chest', 'שכיבות סמיכה', 'Push-up',
   E'ידיים מעט רחבות מהכתפיים\nקו ישר מהראש עד העקבים\nמורידים את החזה כמעט לרצפה',
   E'Hands slightly wider than the shoulders\nStraight line from head to heels\nLower the chest almost to the floor',
   3, 12, 'https://www.youtube.com/watch?v=WDIpL0pjun0'),
  ('cable-fly', 230, 'chest', 'פרפר בכבלים', 'Cable fly',
   E'עמידה מדורגת, כיפוף קל במרפקים\nמקרבים את הידיים בקשת מול החזה\nחוזרים לאט עד מתיחה',
   E'Staggered stance, slight bend in the elbows\nBring the hands together in an arc\nReturn slowly to a stretch',
   3, 12, 'https://www.youtube.com/watch?v=FGF8MR9dmFs'),
  ('dips', 240, 'chest', 'מקבילים', 'Dips',
   E'הטיה קלה קדימה לדגש על החזה\nיורדים בשליטה עד 90 מעלות במרפק\nכתפיים רחוקות מהאוזניים',
   E'Lean slightly forward for the chest\nLower under control to about 90° at the elbow\nShoulders away from the ears',
   3, 10, 'https://www.youtube.com/watch?v=yN6Q1UI_xkE'),
  ('overhead-press', 250, 'shoulders', 'לחיצת כתפיים עם מוט בעמידה', 'Overhead press',
   E'אחיזה מעט רחבה מהכתפיים, אמות אנכיות\nבטן וישבן נעולים\nדוחפים את המוט מעל הראש בקו ישר',
   E'Grip just outside the shoulders, forearms vertical\nBrace the core and glutes\nPress the bar straight overhead',
   4, 8, 'https://www.youtube.com/watch?v=cGnhixvC8uA'),
  ('db-shoulder-press', 260, 'shoulders', 'לחיצת כתפיים עם משקולות בישיבה', 'Seated dumbbell shoulder press',
   E'גב צמוד למשענת\nמרפקים מתחת לשורשי כף היד\nדוחפים למעלה ומורידים לגובה האוזניים',
   E'Back against the pad\nElbows under the wrists\nPress up, lower to ear height',
   3, 10, 'https://www.youtube.com/watch?v=WKEl69bIGus'),
  ('lateral-raise', 270, 'shoulders', 'הרחקה לצדדים', 'Lateral raise',
   E'מרפקים מעט כפופים\nמרימים עד גובה הכתפיים, לא מעבר\nמורידים לאט, בלי תנופה',
   E'Slight bend in the elbows\nRaise to shoulder height, no higher\nLower slowly, no swinging',
   3, 12, 'https://www.youtube.com/watch?v=XPPfnSEATJA'),
  ('face-pull', 280, 'shoulders', 'פייס פול', 'Face pull',
   E'כבל בגובה הפנים עם חבל\nמושכים לכיוון הפנים, מרפקים גבוהים\nמקרבים שכמות ומסובבים החוצה',
   E'Cable at face height with a rope\nPull toward the face, elbows high\nSqueeze the shoulder blades and rotate out',
   3, 15, 'https://www.youtube.com/watch?v=V8dZ3pyiCBo'),
  ('reverse-fly', 290, 'shoulders', 'פרפר הפוך', 'Reverse fly',
   E'הטיה קדימה מהאגן, גב ישר\nמרימים את המשקולות לצדדים\nבלי למשוך עם הגב',
   E'Hinge forward at the hips, flat back\nRaise the dumbbells out to the sides\nDon''t pull with the back',
   3, 12, 'https://www.youtube.com/watch?v=YcsfCkjGUzE'),
  ('barbell-curl', 300, 'arms', 'כפיפת מרפקים עם מוט', 'Barbell curl',
   E'מרפקים צמודים לגוף\nמכופפים בלי להתנדנד\nמורידים לאט עד יישור מלא',
   E'Elbows tight to the body\nCurl without swinging\nLower slowly to full extension',
   3, 10, 'https://www.youtube.com/watch?v=QciWGMjD-nM'),
  ('db-curl', 310, 'arms', 'כפיפת מרפקים עם משקולות', 'Dumbbell curl',
   E'כפות ידיים קדימה, מרפקים צמודים\nמכווצים למעלה\nמורידים בשליטה',
   E'Palms forward, elbows tucked\nSqueeze at the top\nLower under control',
   3, 10, 'https://www.youtube.com/watch?v=tvELVu1Uqe4'),
  ('hammer-curl', 320, 'arms', 'כפיפת פטיש', 'Hammer curl',
   E'אחיזה ניטרלית, כפות ידיים זו מול זו\nמרפקים צמודים לגוף\nבלי תנופה',
   E'Neutral grip, palms facing each other\nElbows tight to the body\nNo swinging',
   3, 10, 'https://www.youtube.com/watch?v=CFBZ4jN1CMI'),
  ('triceps-pushdown', 330, 'arms', 'פשיטת מרפקים בכבל', 'Triceps pushdown',
   E'מרפקים נעולים לצד הגוף\nפושטים עד יישור מלא\nחוזרים לאט, הכתפיים לא זזות',
   E'Elbows pinned to the sides\nPush down to full lockout\nReturn slowly, shoulders still',
   3, 12, 'https://www.youtube.com/watch?v=_w-HpW70nSQ'),
  ('overhead-triceps-extension', 340, 'arms', 'פשיטת מרפקים מעל הראש', 'Overhead triceps extension',
   E'משקולת בשתי ידיים מעל הראש\nהמרפקים מצביעים קדימה ולא נפתחים\nמורידים מאחורי הראש ופושטים',
   E'One dumbbell in both hands overhead\nElbows point forward and stay in\nLower behind the head, extend',
   3, 12, 'https://www.youtube.com/watch?v=YbX7Wd8jQ-Q'),
  ('skull-crusher', 350, 'arms', 'לחיצה צרפתית', 'Skull crusher',
   E'שכיבה על ספסל, מוט מעל החזה\nמורידים לכיוון המצח בתנועת מרפק בלבד\nהזרועות לא זזות',
   E'Lie on a bench, bar over the chest\nLower toward the forehead by bending the elbows only\nUpper arms stay still',
   3, 10, 'https://www.youtube.com/watch?v=GaK2da6B2zM'),
  ('plank', 360, 'core', 'פלאנק', 'Plank',
   E'מרפקים מתחת לכתפיים\nקו ישר מהראש עד העקבים, בטן וישבן מכווצים\nחזרות = שניות של החזקה',
   E'Elbows under the shoulders\nStraight line head to heels, abs and glutes tight\nReps = seconds held',
   3, 30, 'https://www.youtube.com/watch?v=mwlp75MS6Rg'),
  ('side-plank', 370, 'core', 'פלאנק צידי', 'Side plank',
   E'מרפק מתחת לכתף, כפות רגליים זו על זו\nאגן גבוה בקו אחד עם הגוף\nחזרות = שניות לכל צד',
   E'Elbow under the shoulder, feet stacked\nHips up in one line with the body\nReps = seconds per side',
   3, 30, 'https://www.youtube.com/watch?v=44ND4bOB-T0'),
  ('hanging-leg-raise', 380, 'core', 'הרמות רגליים בתלייה', 'Hanging leg raise',
   E'תלייה על מוט, כתפיים פעילות\nמרימים את הרגליים בעזרת הבטן, בלי תנופה\nאפשר להתחיל בברכיים כפופות',
   E'Hang from the bar, shoulders active\nRaise the legs with the abs, no swinging\nStart with bent knees if needed',
   3, 12, 'https://www.youtube.com/watch?v=Nw0LOKe3_l8'),
  ('cable-crunch', 390, 'core', 'כפיפות בטן בכבל', 'Cable crunch',
   E'כריעה מול כבל עליון עם חבל\nהאגן לא זז\nמקפלים את הגב ומקרבים מרפקים לירכיים',
   E'Kneel under a high cable with a rope\nHips stay still\nCurl the spine, elbows toward the thighs',
   3, 15, 'https://www.youtube.com/watch?v=3qjoXDTuyOE'),
  ('russian-twist', 400, 'core', 'טוויסט רוסי', 'Russian twist',
   E'ישיבה בהטיה לאחור, גב ישר\nמסובבים את הגו מצד לצד\nאפשר להתחיל עם רגליים על הרצפה',
   E'Lean back with a straight back\nRotate the torso side to side\nStart with the feet down if needed',
   3, 20, 'https://www.youtube.com/watch?v=nhFynCkYtD4'),
  ('dead-bug', 410, 'core', 'דד באג', 'Dead bug',
   E'שכיבה על הגב, ברכיים ב-90 מעלות וידיים לתקרה\nמורידים יד ורגל נגדית יחד\nהגב התחתון צמוד לרצפה כל הזמן',
   E'On your back, knees at 90°, arms to the ceiling\nLower the opposite arm and leg together\nLower back stays pressed to the floor',
   3, 10, 'https://www.youtube.com/watch?v=bxn9FBrt4-A'),
  ('kettlebell-swing', 420, 'other', 'סווינג עם קטלבל', 'Kettlebell swing',
   E'תנועה מהאגן, לא סקוואט\nמכווצים ישבן ודוחפים את האגן קדימה\nהידיים רפויות, הקטלבל עולה לגובה החזה',
   E'Hinge at the hips, don''t squat\nSqueeze the glutes and snap the hips forward\nArms relaxed, the bell floats to chest height',
   3, 15, 'https://www.youtube.com/watch?v=v3wnrSluDcw'),
  ('burpee', 430, 'other', 'ברפי', 'Burpee',
   E'ידיים לרצפה וקפיצה לפלאנק\nבטן נעולה, בלי לשקוע באגן\nחוזרים לעמידה וקופצים למעלה',
   E'Hands down, jump back to a plank\nCore tight, hips don''t sag\nBack to standing and jump up',
   3, 10, 'https://www.youtube.com/watch?v=qLBImHhCXSw'),
  ('farmers-walk', 440, 'other', 'הליכת חקלאי', 'Farmer''s walk',
   E'משקולת כבדה בכל יד, ידיים ישרות\nגב זקוף וכתפיים למטה\nחזרות = שניות של הליכה',
   E'A heavy weight in each hand, arms straight\nTall back, shoulders down\nReps = seconds walking',
   3, 30, 'https://www.youtube.com/watch?v=Fkzk_RqlYig')
on conflict (slug) do update set
  position = excluded.position,
  muscle_group = excluded.muscle_group,
  name_he = excluded.name_he,
  name_en = excluded.name_en,
  cues_he = excluded.cues_he,
  cues_en = excluded.cues_en,
  default_sets = excluded.default_sets,
  default_reps = excluded.default_reps,
  video_url = excluded.video_url;

-- ---------------------------------------------------------------------------
-- The trainer's copies
-- ---------------------------------------------------------------------------

alter table public.exercises
  add column if not exists catalog_slug text references public.exercise_catalog (slug) on delete set null;
create unique index if not exists exercises_trainer_catalog_uidx
  on public.exercises (trainer_id, catalog_slug) where catalog_slug is not null;

-- The chip label ExerciseForm stores for a muscle group, in the trainer's
-- language (lib/locales: exercises.muscles.*).
create or replace function public.exercise_catalog_label(p_key text, p_lang text)
returns text
language sql
immutable
set search_path = public
as $$
  select case when p_lang = 'en' then
    case p_key when 'legs' then 'Legs' when 'glutes' then 'Glutes' when 'back' then 'Back' when 'chest' then 'Chest'
      when 'shoulders' then 'Shoulders' when 'arms' then 'Arms' when 'core' then 'Core' else 'Other' end
  else
    case p_key when 'legs' then 'רגליים' when 'glutes' then 'ישבן' when 'back' then 'גב' when 'chest' then 'חזה'
      when 'shoulders' then 'כתפיים' when 'arms' then 'ידיים' when 'core' then 'ליבה' else 'אחר' end
  end;
$$;

-- Copies catalog rows (all, or p_slugs) into a trainer's library; one copy per
-- standard exercise, so it only adds what's missing. Returns how many.
create or replace function public.copy_catalog_to_trainer(p_trainer uuid, p_lang text, p_slugs text[])
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_n integer;
begin
  insert into public.exercises (trainer_id, catalog_slug, name, description, muscle_group, video_url, default_sets, default_reps)
  select
    p_trainer,
    c.slug,
    case when p_lang = 'en' then c.name_en else c.name_he end,
    case when p_lang = 'en' then c.cues_en else c.cues_he end,
    public.exercise_catalog_label(c.muscle_group, p_lang),
    c.video_url,
    c.default_sets,
    c.default_reps
  from public.exercise_catalog c
  where p_slugs is null or c.slug = any (p_slugs)
  order by c.position
  on conflict (trainer_id, catalog_slug) where catalog_slug is not null do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Callable by authenticated because the two callers below run as the user
-- (SECURITY INVOKER). That opens nothing: the insert goes through
-- exercises_owner_all, so it only ever writes the caller's own library.
revoke all on function public.copy_catalog_to_trainer(uuid, text, text[]) from public, anon;
grant execute on function public.copy_catalog_to_trainer(uuid, text, text[]) to authenticated;

-- "ספרייה כללית": the calling trainer adds the catalog (or some of it).
create or replace function public.add_catalog_exercises(p_slugs text[] default null)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_lang text;
begin
  select coalesce(p.locale, 'he') into v_lang
  from public.profiles p
  where p.id = (select auth.uid()) and p.role = 'trainer';
  if not found then
    raise exception 'trainers_only';
  end if;
  return public.copy_catalog_to_trainer((select auth.uid()), v_lang, p_slugs);
end;
$$;

revoke all on function public.add_catalog_exercises(text[]) from public, anon;
grant execute on function public.add_catalog_exercises(text[]) to authenticated;

-- A new trainer starts with the catalog. Onboarding inserts the profile with
-- its role (0013 locks the role afterwards), as the new user, whose RLS lets
-- them insert their own exercises.
create or replace function public.seed_trainer_library()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.role = 'trainer' then
    perform public.copy_catalog_to_trainer(new.id, coalesce(new.locale, 'he'), null);
  end if;
  return new;
end;
$$;

revoke all on function public.seed_trainer_library() from public, anon, authenticated;

drop trigger if exists trg_seed_trainer_library on public.profiles;
create trigger trg_seed_trainer_library
  after insert on public.profiles
  for each row execute function public.seed_trainer_library();

-- Existing trainers get it now.
select public.copy_catalog_to_trainer(p.id, coalesce(p.locale, 'he'), null)
from public.profiles p
where p.role = 'trainer';
