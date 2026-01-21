import type { MetaFunction } from "react-router";
import { Link } from "react-router";

export const meta: MetaFunction = () => [{ title: "WonderWay 1 Week Promo" }];

export default function WeekPassPromo() {
  return (
    <>
      <img
        className="absolute top-0 left-1/2 transform -translate-x-1/2 object-cover h-full"
        src="/images/promo/museum-lobby.png"
      />

      <div className="absolute top-4 left-1/2 -translate-x-1/2 flex flex-col w-[366] pointer-events-none">
        Welcome to
      </div>

      <div className="absolute top-36 left-1/2 -translate-x-1/2 flex flex-col items-center w-3/4 pointer-events-none">
        <img className="block size-[38px]" src="/images/logo/nub.png" />
      </div>

      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 flex flex-col gap-2 w-full max-w-96 items-center">
        <h2 className="text-3xl leading-8 text-white text-center mb-6 mx-auto">
          <span className="font-semibold block">
            You are testing something new,{" "}
          </span>
          an AI museum guide that talks to you.
        </h2>
        <p className="text-center leading-none">
          <span className="font-bold text-[64px]">
            1 week
            <br />
          </span>
          <span className="text-[27px]">complimentary access</span>
        </p>
        <Link
          to="/login"
          className="w-10/12 mt-4 px-6 py-3 border border-white text-white bg-black/55 rounded-full text-center pointer-events-auto"
        >
          Get Started
        </Link>
      </div>
    </>
  );
}
