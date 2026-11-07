"use client";
import { MockApp } from "../_kit/MockApp";
import { SignalField } from "./SignalField";
import s from "./signal.module.css";

export default function SignalMock() {
  return <MockApp skin={s} name="Signal" background={(phase) => <SignalField phase={phase} className={s.field} />} />;
}
