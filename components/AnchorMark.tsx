import type {Ref} from 'react';

/** Wharf's existing anchor, shared by the wordmark and its entrance animation. */
export default function AnchorMark({className,ref}:{className?:string;ref?:Ref<SVGSVGElement>}) {
 return <svg ref={ref} className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true"><circle cx="16" cy="6" r="3"/><path d="M16 9v18M10 13h12M5 19c0 5 5 9 11 9s11-4 11-9"/><path d="m2 22 3-5 4 4m14 0 4-4 3 5"/></svg>;
}
