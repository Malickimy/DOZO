export interface GuideItem {
  q: { pl: string; en: string }
  a: { pl: string; en: string }
}

export const GUIDE_POLICY_URL = 'https://support.google.com/contributionpolicy/answer/7400114'

export const GUIDE_ITEMS: GuideItem[] = [
  {
    q: {
      pl: 'Czy mogę dać rabat albo prezent za opinię?',
      en: 'Can I give a discount or gift for a review?',
    },
    a: {
      pl: 'Nie. Google zabrania zachęt, takich jak pieniądze, rabaty czy darmowe produkty, w zamian za opinię, a także za zmianę lub usunięcie negatywnej opinii. Rabat w DooZo dotyczy wyłącznie zapisu do newslettera i jest osobnym kodem. Nie łącz go z opinią w komunikacji: hasło „zostaw opinię i odbierz rabat” łamie zasady.',
      en: 'No. Google prohibits incentives such as money, discounts or free products in exchange for a review, or for changing or removing a negative one. The DooZo discount is only for joining the newsletter and uses a separate code. Don’t link it to reviews in your messaging: “leave a review and get a discount” breaks the rules.',
    },
  },
  {
    q: {
      pl: 'Czy mogę prosić o opinię tylko zadowolonych gości?',
      en: 'Can I ask only happy guests for a review?',
    },
    a: {
      pl: 'Nie. Prośba musi trafiać do wszystkich, bez wstępnego pytania o zadowolenie i bez zniechęcania do negatywnych opinii. DooZo pokazuje kod po każdej płatności, więc ten warunek jest spełniony, dopóki nie wyłączasz ekranu wybiórczo, np. tylko dla niezadowolonych gości.',
      en: 'No. The request has to reach everyone, with no screening question about satisfaction and nothing discouraging negative reviews. DooZo shows the code after every payment, so you meet this rule as long as you don’t switch the screen off selectively, e.g. only for unhappy guests.',
    },
  },
  {
    q: { pl: 'Jak sformułować prośbę o opinię?', en: 'How should I word the review request?' },
    a: {
      pl: 'Neutralnie, np. „Zostaw opinię” albo „Podziel się wrażeniami”. Nie proś o konkretną ocenę, np. „Daj 5 gwiazdek”, ani o konkretną treść, np. wymienienie imienia kelnera.',
      en: 'Keep it neutral, e.g. “Leave a review” or “Share your experience”. Don’t ask for a specific rating, like “Give us 5 stars”, or specific content, like naming a waiter.',
    },
  },
  {
    q: {
      pl: 'Czy obsługa może zachęcać gości do opinii?',
      en: 'Can staff encourage guests to leave reviews?',
    },
    a: {
      pl: 'Może wspomnieć o kodzie na terminalu, ale bez nacisku. Google nie pozwala wymagać ani wywierać presji, żeby gość wystawił opinię jeszcze w lokalu, ani wyznaczać pracownikom liczby opinii do zebrania.',
      en: 'They can mention the code on the terminal, but without pressure. Google doesn’t allow requiring or pressuring guests to review while still on the premises, or setting staff targets for the number of reviews.',
    },
  },
  {
    q: {
      pl: 'Czy pracownicy, rodzina albo znajomi mogą wystawiać opinie?',
      en: 'Can employees, family or friends leave reviews?',
    },
    a: {
      pl: 'Nie. To konflikt interesów i Google usuwa takie opinie. Dotyczy to także byłych pracowników, współpracowników i konkurencji.',
      en: 'No. It’s a conflict of interest and Google removes such reviews. This also covers former employees, business partners and competitors.',
    },
  },
  {
    q: {
      pl: 'Czy mogę kupić opinie albo zlecić je agencji?',
      en: 'Can I buy reviews or hire an agency to write them?',
    },
    a: {
      pl: 'Nie. Kupowanie i publikowanie fałszywych opinii łamie zasady Google, a w Polsce jest też nieuczciwą praktyką rynkową zakazaną ustawą o przeciwdziałaniu nieuczciwym praktykom rynkowym.',
      en: 'No. Buying and posting fake reviews breaks Google’s rules and, under EU and Polish consumer law, is also an unfair commercial practice.',
    },
  },
  {
    q: { pl: 'Jak odpowiadać na negatywne opinie?', en: 'How should I respond to negative reviews?' },
    a: {
      pl: 'Rzeczowo i spokojnie, najlepiej z propozycją rozwiązania. Nie oferuj niczego w zamian za zmianę lub usunięcie opinii. Opinię, która łamie zasady Google, np. spam lub treść obraźliwą, możesz zgłosić w Profilu Firmy.',
      en: 'Calmly and to the point, ideally offering a solution. Don’t offer anything in exchange for changing or removing a review. You can report a review that breaks Google’s rules, e.g. spam or abuse, in your Business Profile.',
    },
  },
  {
    q: { pl: 'Jak ustawić czas wyświetlania kodu?', en: 'How long should the code stay on screen?' },
    a: {
      pl: 'Zacznij od około 15 sekund i obserwuj skany w Przeglądzie. Przy dużym ruchu skróć czas, a obsługa może zamknąć ekran przyciskiem „Gotowe”.',
      en: 'Start at around 15 seconds and watch the scans in Overview. When it’s busy, shorten the time; staff can also close the screen with “Done”.',
    },
  },
  {
    q: { pl: 'Jak mierzyć efekty kampanii?', en: 'How do I measure the campaign’s results?' },
    a: {
      pl: 'W DooZo śledź wyświetlenia i skany kodu. Liczbę opinii sprawdzaj w Profilu Firmy w Google, porównując np. cztery tygodnie przed uruchomieniem DooZo i cztery tygodnie po.',
      en: 'Track code views and scans in DooZo. Check the number of reviews in your Google Business Profile, e.g. comparing four weeks before and four weeks after launching DooZo.',
    },
  },
]
