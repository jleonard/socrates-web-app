import type { MetaFunction } from "react-router";
import { Link } from "react-router";
import { ChevronRight } from "lucide-react";

export const meta: MetaFunction = () => [{ title: "WonderWay Access Expired" }];

export default function Expiration() {
  return (
    <>
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 flex flex-col gap-2 w-full max-w-80 items-center">
        <img className="block size-52" src="/images/logo/big-nub.svg" />
        <h2 className="mt-6 text-3xl text-white font-semibold text-center mx-auto">
          Thank you for exploring with WonderWay
        </h2>
        <p className="mt-6 text-center leading-normal">
          <span className="text-[16px]">Your time has expired.</span>
        </p>
        <Link
          to="/purchase"
          className="flex gap-2 items-center justify-center w-10/12 mt-11 px-6 py-3 text-white bg-black rounded-full text-center pointer-events-auto"
        >
          <span className="uppercase text-sm">Continue</span>
          <ChevronRight size={20} strokeWidth={1.5} />
        </Link>
      </div>
    </>
  );
}
