export function StoreFeatures() {
  const features = [
    {
      title: "Reserve & pickup",
      text: "Build your list online, collect in store",
    },
    {
      title: "School booklists",
      text: "Search your school or upload a new list",
    },
    {
      title: "In-store support",
      text: "Staff ready to help with lists & stock",
    },
    {
      title: "Term ready",
      text: "Textbooks, stationery, and gifts in one place",
    },
  ];

  return (
    <section className="store-features" aria-label="Store benefits">
      <div className="store-features-inner">
        {features.map((feature) => (
          <div key={feature.title} className="store-feature">
            <h3>{feature.title}</h3>
            <p>{feature.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
