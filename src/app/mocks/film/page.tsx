"use client";
import { MockApp } from "../_kit/MockApp";
import s from "./film.module.css";

export default function FilmMock() {
  return (
    <MockApp
      skin={s}
      name="Film"
      background={() => (
        <>
          <video className={s.video} src="/video/hero-720.mp4" poster="/video/hero-poster.jpg" autoPlay muted loop playsInline />
          <div className={s.scrim} />
          <div className={s.grain} />
        </>
      )}
    />
  );
}
