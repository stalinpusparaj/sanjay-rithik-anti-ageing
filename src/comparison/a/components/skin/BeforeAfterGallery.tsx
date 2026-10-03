import { ShieldCheck } from "lucide-react";

import beforeAfterFace from "@/assets/luxury-glow/before-after-face.png";
import beforeAfterKnee from "@/assets/luxury-glow/before-after-knee.png";
import beforeAfterLeg from "@/assets/luxury-glow/before-after-leg.png";
import headerTreatmentRoom from "@/assets/luxury-glow/header-treatment-room-teal.png";

const FEATURE = {
  image: headerTreatmentRoom,
  title: "Premium Treatment Room",
  detail: "A calm clinical setting for consultation-led care in a teal wellness direction.",
};

const CASES = [
  {
    image: beforeAfterFace,
    title: "Facial",
    detail: "4 Sessions",
    note: "Upper lip, chin and facial refinement",
    comparison: true,
  },
  {
    image: beforeAfterLeg,
    title: "Bikini Area",
    detail: "5 Sessions",
    note: "Focused comfort-led laser planning",
    comparison: true,
  },
  {
    image: beforeAfterKnee,
    title: "Legs",
    detail: "6 Sessions",
    note: "Smooth-skin body-care pathway",
    comparison: true,
  },
] as const;

type PremiumGalleryCardProps = {
  image: string;
  title: string;
  detail: string;
  note: string;
  comparison?: boolean;
};

function PremiumGalleryCard({
  image,
  title,
  detail,
  note,
  comparison = false,
}: PremiumGalleryCardProps) {
  return (
    <article className={comparison ? "premium-gallery-card is-comparison" : "premium-gallery-card"}>
      <div className="premium-gallery-photo">
        <img
          src={image}
          alt={title}
          loading="lazy"
          draggable="false"
        />
        {comparison && (
          <>
            <span className="premium-gallery-image-label before">Before</span>
            <span className="premium-gallery-image-label after">After</span>
          </>
        )}
      </div>
      <div className="premium-gallery-copy">
        {!comparison && <span>Premium care</span>}
        <h3>{title}</h3>
        <strong>{detail}</strong>
        <p>{note}</p>
      </div>
    </article>
  );
}

export function BeforeAfterGallery() {
  return (
    <section
      id="a-before-after"
      className="premium-gallery-section"
    >
      <div className="premium-gallery-shell">
        <header className="premium-gallery-header">
          <p>Reference comparisons</p>
          <h2>Want to see what&apos;s possible before visiting our Karur clinic?</h2>
          <p>
            A cleaner editorial view of skin clarity, consultation-led planning and realistic
            reference outcomes, kept in a teal clinical wellness direction.
          </p>
          <div className="premium-gallery-points" aria-label="Gallery principles">
            <span>Clinical clarity</span>
            <span>Calm image rhythm</span>
            <span>Realistic references</span>
          </div>
        </header>

        <figure className="premium-gallery-feature">
          <img src={FEATURE.image} alt={FEATURE.title} loading="lazy" draggable="false" />
          <figcaption>
            <span>Signature visual</span>
            <strong>{FEATURE.title}</strong>
            <p>{FEATURE.detail}</p>
          </figcaption>
        </figure>

        <div className="premium-gallery-grid">
          {CASES.map((item) => (
            <PremiumGalleryCard
              key={item.title}
              image={item.image}
              title={item.title}
              detail={item.detail}
              note={item.note}
              comparison={item.comparison}
            />
          ))}
        </div>

        <div className="premium-gallery-note">
          <ShieldCheck />
          <p>
            Visuals are educational and brand-experience references. Suitability, sessions,
            comfort, recovery and outcomes vary and must be discussed with the dermatologist.
          </p>
        </div>
      </div>
    </section>
  );
}
