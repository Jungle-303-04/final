import { useState } from "react";

const routes = ["Overview", "Runs", "Settings"];

export default function AnimatedRouteSwipeTabsExample() {
  const [route, setRoute] = useState(routes[0]);

  return (
    <div className="route-transition">
      <div className="animated-tabs-list">
        {routes.map((item) => (
          <button className={route === item ? "active" : ""} key={item} onClick={() => setRoute(item)}>
            {item}
          </button>
        ))}
      </div>
      <section key={route}>
        <strong>{route}</strong>
        <span>Route content re-enters on tab change</span>
      </section>
    </div>
  );
}
